import * as THREE from 'three';
import { ARButton } from '/scripts/threejs/ARButton.js';

class Projection {
    constructor() {
        this.EARTH = 40075016.68;
        this.HALF_EARTH = 20037508.34;
    }

    project(lon, lat) {
        return [this.lonToSphMerc(lon), this.latToSphMerc(lat)];
    }

    unproject(coords) {
        return [this.sphMercToLon(coords[0]), this.sphMercToLat(coords[1])];
    }

    lonToSphMerc(lon) {
        return lon / 180 * this.HALF_EARTH;
    }

    latToSphMerc(lat) {
        return Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180) * this.HALF_EARTH / 180;
    }

    sphMercToLon(x) {
        return x / this.HALF_EARTH * 180;
    }

    sphMercToLat(y) {
        const lat = y / this.HALF_EARTH * 180;
        return 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
    }

    getID() {
        return "epsg:3857";
    }
}
let camera, scene, renderer, light;
let grCamera;
let EarthProject = new Projection();
let controller;
let firstLoad = true;
let _gpsMinAccuracy = 20;
let minNear = 1;
let maxFar = 20000;
var default_distance = 100;
let initialPositionAsOrigin = true;
let initialPosition = null;
var dataIconList = [];
var arrObject = [];
var dictCheckStateTatekanban = {};
let xrRefSpace;
let _arrGPSLocation = [];
var _timeCheckLocation = 1000;
var latAfterCal = null;
var lngAterCal = null;
var startTime = 0;
var _lastCoords = null;
var _gpsMaxDistance = 6;
SetMapIconDisplayAR();
init();

function SetMapIconDisplayAR() {
    $.ajax({
        type: "get",
        url: '/MapIcon/GetMapIcons',
        dataType: "json",
        cache: true,
        async: false,
        success: function (data) {
            for (let key in data) {
                var valueLst = data[key].split(',');
                if (valueLst[1] == '' || valueLst[2] == '') {
                    continue;
                }
                var urlAR = '../../' + valueLst[0];
                var latAR = valueLst[1];
                var lngAR = valueLst[2];
                var textAR = valueLst[3];
                dataIconList.push({ name: textAR, latitude: latAR, longitude: lngAR, src: urlAR, mapIconCode: key });
            }
        }
    });
}
function init() {
    const container = document.createElement('div');
    document.body.appendChild(container);

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, minNear, maxFar);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    controller = renderer.xr.getController(0);
    container.appendChild(renderer.domElement);
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(watchCameraPosition, handleError, {
            enableHighAccuracy: true,
            maximumAge: 0
        });
    } else {
        console.error("Geolocation is not supported by this browser.");
    }
    renderer.setAnimationLoop(animate);

    

    document.body.appendChild(ARButton.createButton(renderer));

}

function handleError(error) {
    console.error('Geolocation error:', error);
}
function convertGPSToXYZ(lat, lng, radius) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);
    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = (radius * Math.sin(phi) * Math.sin(theta));
    const y = (radius * Math.cos(phi));
    return new THREE.Vector3(x, y, z);
}

// Function to create a world matrix from GPS coordinates
function createWorldMatrixFromGPS(lat, lng, radius = 6371) {
    const position = convertGPSToXYZ(lat, lng, radius);
    const matrix = new THREE.Matrix4();
    matrix.setPosition(position);
    return matrix;
}
function watchCameraPosition(pos) {
    // Apply machine learning in GPS
    if (pos.coords.accuracy <= _gpsMinAccuracy && pos.timestamp != null) {
        if (startTime == 0) {
            startTime = new Date(pos.timestamp);
            _arrGPSLocation.push(pos.coords);
            return;
        } else {
            var currentTime = new Date(pos.timestamp);
            var CheckTime = currentTime - startTime;
            _arrGPSLocation.push(pos.coords);
            if (CheckTime >= _timeCheckLocation) {
                var sumLat = 0;
                var sumLng = 0;
                var sumWeight = 0;
                var indexGPS = 0;
                var countGPS = _arrGPSLocation.length;
                while (indexGPS < countGPS) {
                    var value = _arrGPSLocation[indexGPS];

                    var is_check = (_lastCoords == null) ? true : (DistanceBetweenPoints(_lastCoords, value) <= _gpsMinAccuracy);
                    if (is_check) {
                        var weightIndex = 1.0 / value.accuracy;
                        sumLat += value.latitude * weightIndex;
                        sumLng += value.longitude * weightIndex;
                        sumWeight += weightIndex;
                        indexGPS = indexGPS + 1;
                    } else {
                        _arrGPSLocation.splice(indexGPS, 1);
                        countGPS = countGPS - 1;
                    }
                }
                latAfterCal = sumLat / sumWeight;
                lngAterCal = sumLng / sumWeight;

                startTime = currentTime;
            } else {
                return;
            }
        }
    }

    if (pos.coords.accuracy < _gpsMinAccuracy) {
        //When AR session start
        if (ARButton.SessionARFF) {
            //Fisrt Load AR 
            if (firstLoad) {
                var latCamera = null,lngCamera = null;
                if (latAfterCal && lngAterCal) {
                    latCamera = latAfterCal;
                    lngCamera = lngAterCal;
                } else {
                    latCamera = pos.coords.latitude;
                    lngCamera = pos.coords.longitude;
                }
                camera.quaternion.setFromRotationMatrix(controller.matrixWorld);
                const worldPos = convertGPSToWorldCoordinates(latCamera, lngCamera);
                debugger
                //const worldPos = convertGPSToWorldCoordinates(pos.coords.latitude, pos.coords.longitude);
                //const worldMatrix = createWorldMatrixFromGPS(pos.coords.latitude, pos.coords.longitude, radius);
                //camera.position.set(worldPos.x, 1.6, worldPos.z).applyMatrix4(controller.matrixWorld);
                /*camera.position.set(0, 1.6, 0).applyMatrix4(controller.matrixWorld);
                camera.quaternion.setFromRotationMatrix(controller.matrixWorld);
                camera.updateProjectionMatrix();*/
                //camera.applyMatrix4(worldMatrix);
                grCamera = new THREE.Group();
                grCamera.add(camera);
                grCamera.position.set(worldPos.x, 1.6, worldPos.z);
                scene.add(grCamera);
                light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 5);
                light.position.copy(grCamera.position);

                scene.add(light);

                if (dataIconList.length != 0) {
                    InitSceneAR(pos.coords);
/*                    CreateARObjectTam(dataIconList[0], 0, 15);
                    CreateARObjectTam(dataIconList[66], 0, -40);
                    CreateARObjectTam(dataIconList[2], 15, 0);
                    CreateARObjectTam(dataIconList[30], -30, 0);*/
                    /*CreateARObjectTam(dataIconList[4], 10, 10);
                    CreateARObjectTam(dataIconList[5], 10, -10);
                    CreateARObjectTam(dataIconList[6], -10, 10);
                    CreateARObjectTam(dataIconList[7], -10, -10);*/

                } else {
                    alert("Can not import from database");
                }
                firstLoad = false;
                //alert("positon camera start : " + camera.position.x + " " + camera.position.y + " " + camera.position.z)
            } else {
               // alert("positon camera : " + camera.position.x + " " + camera.position.y + " " + camera.position.z)
            }
            
        } else {

        }
    }
}
function InitSceneAR(my_location) {
    for (var i = 0; i < dataIconList.length; i++) {
        //default_distance = $('#distanceScale').val();
        var is_create = false;
        var current_distance = DistanceBetweenPoints(my_location, dataIconList[i]);
        if (current_distance <= default_distance) {
            is_create = true;
        }
        if (is_create) {
            CreateARObject(dataIconList[i]);
            //arrObject.push(dataIconList[i]);
        }
        dictCheckStateTatekanban[dataIconList[i].mapIconCode] = is_create;
    }


   // document.getElementById('btnCusttormSize').style = "position: absolute; z-index: 9999; width: 250px; height: 35px; top: 80px; left: 20px; font-size: 15px; align-items: center; display: flex;";
}
function drawRoundedRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(x + width - radius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + radius);
    context.lineTo(x + width, y + height - radius);
    context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    context.lineTo(x + radius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
}
function CreateTextTexture(id, text) {

    var text_img = document.createElement('img');
    text_img.id = id;

    // Create a canvas element
    var canvas = document.createElement('canvas');
    var padding = 5; // padding around the text
    // Calculate text height
    var textHeight = parseInt('35px Arial', 10);
    // Set the canvas height to half of the original
    canvas.height = (textHeight + padding * 2);
    // Get the 2D context
    var context = canvas.getContext('2d');
    var borderRadius = 30;
    context.fillStyle = 'rgba(240, 240, 240, 0.50)';
    drawRoundedRect(context, 0, 0, canvas.width, canvas.height, borderRadius);
    context.fill();
    //context.fillRect(0, 0, canvas.width, canvas.height);

    // Set font and text properties
    context.font = '35px Arial';
    context.fillStyle = '#000000';


    var textX = canvas.width / 2 - context.measureText(text).width / 2;
    var textY = canvas.height / 2 + padding * 2;

    // Draw the text on the canvas
    context.fillText(text, textX, textY);

    //get Url data
    var texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    return texture;
}
function CreateARObject(dataItemAR) {
    var sizeObject = 15;
    var heightText = 9;
    const itemPosition = convertGPSToWorldCoordinates(dataItemAR.latitude, dataItemAR.longitude);
    var loader = new THREE.TextureLoader();
    var texture = loader.load(dataItemAR.src);
    var geometry = new THREE.PlaneGeometry(sizeObject, sizeObject);
    var material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    var object = new THREE.Mesh(geometry, material);

    object.userData.id = dataItemAR.mapIconCode;
    object.name = dataItemAR.name;
    var textTexture = CreateTextTexture(dataItemAR.mapIconCode, dataItemAR.name);
    var textMaterial = new THREE.MeshBasicMaterial({ map: textTexture, transparent: true });
    var textGeometry = new THREE.PlaneGeometry(sizeObject, 2);
    var textObject = new THREE.Mesh(textGeometry, textMaterial);
    textObject.position.set(0, heightText, 0);

    object.add(textObject);

    arrObject.push(object);
    object.position.set(itemPosition.x, 0, itemPosition.z).applyMatrix4(controller.matrixWorld);
    object.quaternion.setFromRotationMatrix(controller.matrixWorld);
    scene.add(object);
}

function CreateARObjectTam(dataItemAR, x, z) {
    const itemPosition = convertGPSToWorldCoordinates(dataItemAR.latitude, dataItemAR.longitude);
    var loader = new THREE.TextureLoader();
    var texture = loader.load(dataItemAR.src);
    var geometry = new THREE.PlaneGeometry(10, 10);
    var material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    var object = new THREE.Mesh(geometry, material);
    object.lookAt(camera.position);
    object.userData.id = dataItemAR.mapIconCode;

    var textTexture = CreateTextTexture(dataItemAR.mapIconCode, dataItemAR.name);
    var textMaterial = new THREE.MeshBasicMaterial({ map: textTexture, transparent: true });
    var textGeometry = new THREE.PlaneGeometry(10, 2);
    var textObject = new THREE.Mesh(textGeometry, textMaterial);
    textObject.position.set(0, 6, 0);

    object.add(textObject);

    // arrObject.push(object);
    object.position.set(x, 0, z).applyMatrix4(controller.matrixWorld);
    object.quaternion.setFromRotationMatrix(controller.matrixWorld);
    object.lookAt(camera.position);
    scene.add(object);
}
function CreateObjectInXR(x, z) {
    const geometry = new THREE.CylinderGeometry(0, 0.05, 0.2, 32).rotateX(Math.PI / 2);
    const material = new THREE.MeshPhongMaterial({ color: 0xffffff * Math.random() });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, 0, z).applyMatrix4(controller.matrixWorld);
    mesh.quaternion.setFromRotationMatrix(controller.matrixWorld);
    scene.add(mesh);
}
function gpsToThreeJS(lat, lon, radius = 1) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);

    const x = -radius * Math.sin(phi) * Math.cos(theta);
    const z = radius * Math.sin(phi) * Math.sin(theta);

    return { x, z };
}
function convertGPSToWorldCoordinates(lat, lon) {
    const R = 6371000; // Earth's radius in meters

    const x = R * THREE.MathUtils.degToRad(lon);
    const z = R * Math.log(Math.tan(Math.PI / 4 + THREE.MathUtils.degToRad(lat) / 2));
    return { x : x, z : z};
}
function animate(timeshape, frame) {
    // alert(camera.position.x + " " + camera.position.y + " "+ camera.position.z);
    if (light) {
        light.position.copy(camera.position);
    }
    /*if (ARButton.SessionARFF && firstLoad == false) {
        console.log(camera.position.x + " " + camera.position.y + " " + camera.position.z);
    }*/
    
    renderer.render(scene, camera);

}
function DistanceBetweenPoints(pointA, pointB) {
    var distance = google.maps.geometry.spherical.computeDistanceBetween(new google.maps.LatLng(pointA.latitude, pointA.longitude), new google.maps.LatLng(pointB.latitude, pointB.longitude));
    return distance;
}

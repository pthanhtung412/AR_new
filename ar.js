import * as THREE from 'three';
import { ARButton } from '/scripts/threejs/ARButton.js';
/*import { OrbitControls } from '/scripts/threejs//OrbitControls.js';*/
import {
    AbsoluteOrientationSensor,
    RelativeOrientationSensor
} from '/scripts/threejs/motion-sensors.js';

const params = new URLSearchParams(new URL(window.location.href).search.slice(1));
const relative = !!Number(params.get("relative"));
const coordinateSystem = params.get("coord");
let sensor;
let camera, scene, renderer, light,controls;
let grCamera;
let controller;
let firstLoadGPS = true;
let firstFrameAfterGPS = true;
let _gpsMinAccuracy = 15;
let minNear = 0.1;
let maxFar = 20000;
let minDistance = 2;
var default_distance = 100;
let initialPositionAsOrigin = true;
let initialPosition = null;
var dataIconList = [];
var arrObject = [];
var arrDistanceObject = [];
var arrDistance = [];
var dictCheckStateTatekanban = {};
let xrRefSpace;
let _arrGPSLocation = [];
var _timeCheckLocation = 1000;
var latAfterCal = null;
var lngAterCal = null;
var startTime = 0;
var _lastCoords = null;
var _gpsMaxDistance = 6;
let firstOrient = true;
var alphaCompass = null, webkitAlphaCompass = null;
let eulerOrientation = null;
let quaternionOrient = null;
let watchPositionID = null;
var latCamera = null, lngCamera = null;
var wgs84 = null;
var utmZone = null;
var utmProjection = null;
var firstloadUTM = true;
var polyfill = null;
var sizeObject = 1.5;
var sizeText = 2;
var heightText = 1;
var DistanceInterValId = null;
if ('xr' in navigator === false) {
    window.polyfill = new WebXRPolyfill();
}

const redArrowImg = '/Content/images/red_arrow.png'
// Đảm bảo proj4js đã được tải vào nếu dùng CDN
if (typeof proj4 === 'undefined') {
    console.error('proj4js chưa được tải vào.');
} else 
    // Định nghĩa các hệ tọa độ
    wgs84 = 'EPSG:4326'; // Hệ tọa độ WGS84 (Latitude, Longitude)

var flag = true
const onScreenOrientationChangeEvent = (event) => {
    var alpha, webkitAlpha;
    //Check for iOS property
    if (event.webkitCompassHeading) {
        alpha = event.webkitCompassHeading;
        //Rotation is reversed for iOS
    }
    //non iOS
    else {
        if (event.absolute) {
            alpha = event.alpha;
            webkitAlpha = alpha;
            if (!window.chrome) {
                //Assume Android stock (this is crude, but good enough for our example) and apply offset
                webkitAlpha = alpha - 270;
            }
        }
        
    }
    alphaCompass = alpha;
    webkitAlphaCompass = webkitAlpha;
    const alphaOrient = event.alpha ? THREE.MathUtils.degToRad( event.alpha) : 0; // Z axis (compass)
    const betaOrient = event.beta ? THREE.MathUtils.degToRad(event.beta) : 0;    // X axis
    const gammaOrient = event.gamma ? THREE.MathUtils.degToRad(event.gamma) : 0; // Y axis
    alphaCompass = alphaOrient;
    if (flag == true) {
        alert(alphaCompass)
        flag = false
    }
    //eulerOrientation = new THREE.Euler(0, -alphaOrient, 0, 'XYZ');

}

SetMapIconDisplayAR();
init();
/*if (navigator.permissions) {
    // https://w3c.github.io/orientation-sensor/#model
    Promise.all([navigator.permissions.query({ name: "accelerometer" }),
    navigator.permissions.query({ name: "magnetometer" }),
    navigator.permissions.query({ name: "gyroscope" })])
        .then(results => {
            if (results.every(result => result.state === "granted")) {
                initSensor();
            } else {
                console.log("Permission to use sensor was denied.");
            }
        }).catch(err => {
            console.log("Integration with Permissions API is not enabled, still try to start app.");
            initSensor();
        });
} else {
    console.log("No Permissions API, still try to start app.");
    initSensor();
}*/
function getUTMZone(longitude) {
    var utmZoneTemp = Math.floor((longitude + 180) / 6) + 1;
    return `+proj=utm +zone=${utmZoneTemp} +datum=WGS84 +units=m +no_defs`;
}
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
    alert("hi1")
    //Check the device's hardware sensors 
    if (window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission === 'function') {
        window.DeviceOrientationEvent.requestPermission().then((response) => {
            if (response === 'granted' && 'ondeviceorientationabsolute' in window) {
                window.addEventListener('deviceorientationabsolute', onScreenOrientationChangeEvent);
            }
        }).catch((error) => {
            console.error('THREE.DeviceOrientationControls: Unable to use DeviceOrientation API:', error);
        });
    } else {
        //Android
        if ('ondeviceorientationabsolute' in window) {
            window.addEventListener('deviceorientationabsolute', onScreenOrientationChangeEvent);
        }
    }
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
   // debugger
    document.body.appendChild(ARButton.createButton(renderer));
    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);

    //Check GPS
    if (navigator.geolocation) {
        watchPositionID = navigator.geolocation.watchPosition(watchCameraPosition, handleError, {
            enableHighAccuracy: true,
            maximumAge: 0
        });
    } else {
        console.error("Geolocation is not supported by this browser.");
    }

    scene.add(camera);
/*    renderer.xr.addEventListener('sessionend', () => {
        // Remove the event listener to prevent duplicate listeners
        window.removeEventListener('deviceorientationabsolute', updateCameraOrientation);
    });*/
    renderer.setAnimationLoop(animate);


}

function initSensor() {
    debugger
    const options = { frequency: 60, coordinateSystem };
    console.log(JSON.stringify(options));

    sensor = relative ? new RelativeOrientationSensor(options) : new AbsoluteOrientationSensor(options);
    sensor.onreading = () => {
        //alert("test");
        if (firstFrameAfterGPS && grCamera && !firstLoadGPS) {
            //alert("Thanh cong");
            // Lấy quaternion từ cảm biến
            var sensorQuat = sensor.quaternion;

            const cameraQuaternion = camera.quaternion.clone();

            const combinedQuaternion = sensorQuat.multiply(cameraQuaternion);
            // Chuyển đổi quaternion thành góc Euler
            const euler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(...combinedQuaternion), 'YXZ');

            // Chỉ lấy góc quay quanh trục Y
            const yRotation = euler.y;

            // Xoay camera quanh trục Y với góc yRotation
            grCamera.rotation.y = yRotation;
            firstFrameAfterGPS = false;
        }
    }
    sensor.onerror = (event) => {
        if (event.error.name == 'NotReadableError') {
            console.log("Sensor is not available.");
        }
    }
    sensor.start();
}
function updateCameraOrientation(event) {
    const alpha = event.alpha ? THREE.MathUtils.degToRad(event.alpha) : 0; // Z axis (compass)
    const beta = event.beta ? THREE.MathUtils.degToRad(event.beta) : 0;    // X axis
    const gamma = event.gamma ? THREE.MathUtils.degToRad(event.gamma) : 0; // Y axis

    const euler = new THREE.Euler(beta, alpha, -gamma, 'YXZ');
    const quaternion = new THREE.Quaternion().setFromEuler(euler);

    if (camera && firstLoadGPS) {
        camera.quaternion.copy(quaternion);
        camera.updateProjectionMatrix();
    }
}
function handleError(error) {
    console.error('Geolocation error:', error);
}

function watchCameraPosition(pos) {
    //Check UTM Zone 
    if (pos.coords.accuracy <= _gpsMinAccuracy && firstloadUTM) {
        utmProjection = getUTMZone(pos.coords.longitude);
        firstloadUTM = false;
    }

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
            /*alert(pos.coords.heading + " " + alphaCompass * 180 / Math.PI)*/
            if (latAfterCal && lngAterCal) {
                latCamera = latAfterCal;
                lngCamera = lngAterCal;
            } else {
                latCamera = pos.coords.latitude;
                lngCamera = pos.coords.longitude;
            }
            var mypoint = { latitude: latCamera, longitude: lngCamera };
            //Fisrt Load AR 
            if (firstLoadGPS) {
                //camera.quaternion.setFromRotationMatrix(controller.matrixWorld);
                debugger
                const worldPos = convertGPSToWorldCoordinates(latCamera, lngCamera);
                const posCart = toCartesian(latCamera, lngCamera);
                

                var projectPos = proj4(wgs84, utmProjection, [lngCamera, latCamera]);
                if (initialPositionAsOrigin) {
                    initialPosition = { x: projectPos[0], z: projectPos[1] };
                }
                
                grCamera = new THREE.Group();
                var direction = new THREE.Vector3();
                grCamera.getWorldDirection(direction);
                grCamera.add(camera);
                grCamera.position.setY(1.6);
                scene.add(grCamera);

                /*var orginEarth = toCartesian(0, 0);
                grCamera.lookAt(new THREE.Vector3(orginEarth.x, 1.6, orginEarth.z));
                var direction = new THREE.Vector3();
                var angle = calculatorOrientEarth(mypoint);
                if (alphaCompass) {
                        quaternionOrient = new THREE.Quaternion();
                        const axis = new THREE.Vector3(0, 1, 0); // Trục Y
                        quaternionOrient.setFromAxisAngle(axis, alphaCompass);
                        grCamera.quaternion.copy(quaternionOrient);
                    
                }*/


                
                /*grCamera.getWorldDirection(direction);
                alert("huong den 1 " + direction.x + " " + direction.y + " " + direction.z);
          
                grCamera.getWorldDirection(direction);
                
                alert("huong den 2 " + direction.x + " " + direction.y + " " + direction.z);*/
                
                /*                if (alphaCompass) {
                   angle= angle + alphaCompass;
                }*/
                
               
                /*if (eulerOrientation) {
                    camera.quaternion.setFromRotationMatrix(controller.matrixWorld);
                    grCamera.quaternion.setFromEuler(eulerOrientation); 
                    //window.removeEventListener('deviceorientationabsolute', onScreenOrientationChangeEvent);
                }*/
                /*if (quaternionOrient) {
                    grCamera.quaternion.copy(quaternionOrient);
                }*/
                /*if (angle) {
                    quaternionOrient = new THREE.Quaternion();
                    const axis = new THREE.Vector3(0, 1, 0); // Trục Y
                    quaternionOrient.setFromAxisAngle(axis, -angle);
                    grCamera.quaternion.copy(quaternionOrient);
                }

                */

                //camera.position.set(worldPos.x, 1.6, worldPos.z);
                //controls.update();
                light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 5);
                light.position.copy(camera.position);

                scene.add(light);
                
                if (dataIconList.length != 0) {
                    InitSceneAR(mypoint);
                    //CreateARObjectTam(dataIconList[66], 0, -2);
                    DistanceInterValId = setInterval(CheckDistanceObjectInterval, 1000);

                } else {
                    alert("データベースから習得できない");
                }
                firstLoadGPS = false;

                
                
                
            } else {
                //if (pos.coords.heading && alphaCompass) {
                //    alert(pos.coords.heading + " " + alphaCompass)
                //}
                // When after first load GPS, check 
                updateSceneAR(mypoint);
            }
        } else {
            //When AR close
            clearInterval(DistanceInterValId);
        }
    }
}
function InitSceneAR(my_location) {
    var alphaState = 0;
    if (alphaCompass) {
        alphaState = alphaCompass;
    }
    //var firstCreate = false;
    debugger;
    var x = 0;
    for (var i = 0; i < dataIconList.length; i++) {
        //default_distance = $('#distanceScale').val();
        var is_create = false;
        var current_distance = DistanceBetweenPoints(my_location, dataIconList[i]);
        if (current_distance <= default_distance) {
            is_create = true;
        }
        if (is_create) {
            if (x < 4) {
                /*CreateARObject2(dataIconList[i], alphaState);*/
                x += 1
                CreateARObject(dataIconList[i], alphaState);
            }
            else {
                CreateARObject(dataIconList[i], alphaState);
            }
            //firstCreate = true;
            //arrObject.push(dataIconList[i]);
        }
        dictCheckStateTatekanban[dataIconList[i].mapIconCode] = is_create;
/*        if (firstCreate) {
            break;
        }*/

    }
    var ar = [...arr1, ...arr2, ...arr3];
    //alert(ar)
   // document.getElementById('btnCusttormSize').style = "position: absolute; z-index: 9999; width: 250px; height: 35px; top: 80px; left: 20px; font-size: 15px; align-items: center; display: flex;";
}
function updateSceneAR(my_location) {
    var alphaState = 0;
    if (alphaCompass) {
        alphaState = alphaCompass;
    }
    if (dataIconList.length > 0) {
        for (var i = 0; i < dataIconList.length; i++) {
            var is_create = false;
            var current_distance = DistanceBetweenPoints(my_location, dataIconList[i]);
            if (current_distance <= default_distance) {
                is_create = true;
            }
            if (is_create) {
                if (!dictCheckStateTatekanban[dataIconList[i].mapIconCode]) {
                    CreateARObject(dataIconList[i], alphaState);
                }
            } else {
                if (dictCheckStateTatekanban[dataIconList[i].mapIconCode]) {
                    RemoveARObject(dataIconList[i]);
                }
            }
            dictCheckStateTatekanban[dataIconList[i].mapIconCode] = is_create;
        }
    }
}
function RemoveARObject(dataItemAR) {
    // Find the object with the specified ID
    for (let i = 0; i < arrObject.length; i++) {
        if (arrObject[i].userData.id === dataItemAR.mapIconCode) {
            // Remove the object from the scene
            scene.remove(arrObject[i]);
            // Dispose of the object's geometry and material
            arrObject[i].geometry.dispose();
            arrObject[i].material.dispose();
            // Remove the object from the array
            arrObject.splice(i, 1);
            break; // Exit the loop after finding and removing the object
        }
    }
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
    var padding = 4; // padding around the text
    // Calculate text height
    var textHeight = parseInt('25px Arial', 10);
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
    context.font = 'bold 25px Arial';
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
function CreateDistanceTexture(number_text, text_color) {
    var text_img = document.createElement('img');

    // Create a canvas element
    var canvas = document.createElement('canvas');
    var padding = 4; // padding around the text
    // Calculate text height
    var textHeight = parseInt('25px Arial', 10);
    // Set the canvas height to half of the original
    canvas.height = (textHeight + padding * 2);
    // Get the 2D context
    var context = canvas.getContext('2d');
    var borderRadius = 30;
    context.fillStyle = text_color;
    drawRoundedRect(context, 0, 0, canvas.width, canvas.height, borderRadius);
    context.fill();
    //context.fillRect(0, 0, canvas.width, canvas.height);

    // Set font and text properties
    context.font = 'bold 25px Arial';
    context.fillStyle = '#000000';


    var textX = canvas.width / 2 - context.measureText(number_text).width / 2;
    var textY = canvas.height / 2 + padding * 2;

    // Draw the text on the canvas
    context.fillText(number_text, textX, textY);

    //get Url data
    var texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    return texture;
}
function CreateARObject(dataItemAR, alphaState) {
    const itemPosition = ConvertPositionAndRotate(dataItemAR.latitude, dataItemAR.longitude, alphaState);
    var loader = new THREE.TextureLoader();
    var texture = loader.load(dataItemAR.src);
    var geometry = new THREE.PlaneGeometry(sizeObject, sizeObject);
    var material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    var object = new THREE.Mesh(geometry, material);
    object.userData.id = dataItemAR.mapIconCode;
    object.name = dataItemAR.name;
    var textTexture = CreateTextTexture(dataItemAR.mapIconCode, dataItemAR.name);
    var textMaterial = new THREE.MeshBasicMaterial({ map: textTexture, transparent: true, side: THREE.DoubleSide });
    var textGeometry = new THREE.PlaneGeometry(sizeText, 0.5);
    var textObject = new THREE.Mesh(textGeometry, textMaterial);
    textObject.position.set(0, heightText, 0);

    object.add(textObject);
    
    arrObject.push(object);
    object.position.set(itemPosition.x, 0, itemPosition.z)
    object.lookAt(grCamera ? grCamera.position : camera.position);
    //object.quaternion.setFromRotationMatrix(controller.matrixWorld);
    scene.add(object);
}

function CreateARObjectTam(dataItemAR, x,z) {
    const itemPosition = ConvertPositionAndRotate(dataItemAR.latitude, dataItemAR.longitude);
    var loader = new THREE.TextureLoader();
    var texture = loader.load(dataItemAR.src);
    var geometry = new THREE.PlaneGeometry(sizeObject, sizeObject);
    var material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    var object = new THREE.Mesh(geometry, material);
    object.userData.id = dataItemAR.mapIconCode;
    object.name = dataItemAR.name;
    var textTexture = CreateTextTexture(dataItemAR.mapIconCode, dataItemAR.name);
    var textMaterial = new THREE.MeshBasicMaterial({ map: textTexture, transparent: true, side: THREE.DoubleSide });
    var textGeometry = new THREE.PlaneGeometry(sizeText, 0.5);
    var textObject = new THREE.Mesh(textGeometry, textMaterial);
    textObject.position.set(0, heightText, 0);

    object.add(textObject);

    arrObject.push(object);
    object.position.set(x, 0, z)
    object.lookAt(grCamera ? grCamera.position : camera.position);
    //object.quaternion.setFromRotationMatrix(controller.matrixWorld);
    scene.add(object);
}

function CreateARObject2(dataItemAR, alphaState) {
    var sizeObject = 13;
    var heightText = 9;
    const itemPosition = ConvertPositionAndRotate(dataItemAR.latitude, dataItemAR.longitude, alphaState);
    var loader = new THREE.TextureLoader();
    var texture = loader.load(dataItemAR.src);
    var geometry = new THREE.PlaneGeometry(sizeObject, sizeObject);
    var material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    var object = new THREE.Mesh(geometry, material);
    object.userData.id = dataItemAR.mapIconCode;
    object.name = dataItemAR.name;
    var textTexture = CreateTextTexture(dataItemAR.mapIconCode, dataItemAR.name);
    var textMaterial = new THREE.MeshBasicMaterial({ map: textTexture, transparent: true, side: THREE.DoubleSide });
    var textGeometry = new THREE.PlaneGeometry(sizeObject, 2);
    var textObject = new THREE.Mesh(textGeometry, textMaterial);
    textObject.position.set(0, heightText, 0);

    object.add(textObject);

    arrObject.push(object);
    object.position.set(itemPosition.x, camera.position.y, itemPosition.z)
    object.lookAt(grCamera ? grCamera.position : camera.position);
    //object.quaternion.setFromRotationMatrix(controller.matrixWorld);
    scene.add(object);

    animateJump(object);
}
function CreateARObject3(dataItemAR, alphaState) {
    var sizeObject = 13;
    var heightText = 9;
    const itemPosition = ConvertPositionAndRotate(dataItemAR.latitude, dataItemAR.longitude, alphaState);
    var loader = new THREE.TextureLoader();
    var texture = loader.load(dataItemAR.src);
    var geometry = new THREE.PlaneGeometry(sizeObject, sizeObject);

    // Sử dụng MeshStandardMaterial với thuộc tính emissive để tạo hiệu ứng phát sáng
    var material = new THREE.MeshStandardMaterial({
        map: texture,
        emissive: new THREE.Color(0x00ff00), // Màu phát sáng
        emissiveIntensity: 0.5, // Độ sáng
        transparent: true,
        side: THREE.DoubleSide
    });

    var object = new THREE.Mesh(geometry, material);
    object.userData.id = dataItemAR.mapIconCode;
    object.name = dataItemAR.name;

    var textTexture = CreateTextTexture(dataItemAR.mapIconCode, dataItemAR.name);
    var textMaterial = new THREE.MeshBasicMaterial({ map: textTexture, transparent: true, side: THREE.DoubleSide });
    var textGeometry = new THREE.PlaneGeometry(sizeObject, 2);
    var textObject = new THREE.Mesh(textGeometry, textMaterial);
    textObject.position.set(0, heightText, 0);

    object.add(textObject);

    arrObject.push(object);
    object.position.set(itemPosition.x, camera.position.y, itemPosition.z);
    object.lookAt(grCamera ? grCamera.position : camera.position);
    scene.add(object);

}
function CreateARObject4(dataItemAR, alphaState) {
    var sizeObject = 13;
    var heightText = 9;
    const itemPosition = ConvertPositionAndRotate(dataItemAR.latitude, dataItemAR.longitude, alphaState);
    var loader = new THREE.TextureLoader();
    var texture = loader.load(dataItemAR.src);
    var geometry = new THREE.PlaneGeometry(sizeObject, sizeObject);
    var material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    var object = new THREE.Mesh(geometry, material);
    object.userData.id = dataItemAR.mapIconCode;
    object.name = dataItemAR.name;

    var circleGeometry = new THREE.CircleGeometry(sizeObject, 32); // Kích thước và độ chi tiết của vòng tròn
    var circleMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide, transparent: true, opacity: 0.5 }); // Màu vàng, độ trong suốt 50%
    var circle = new THREE.Mesh(circleGeometry, circleMaterial);

    // Đặt vị trí của vòng tròn dưới chân đối tượng
    circle.rotation.x = -Math.PI / 2; // Xoay vòng tròn để nó nằm ngang trên mặt đất
    circle.position.set(0, -heightText / 2, 0); // Đặt dưới đối tượng

    object.add(circle); // Thêm vòng tròn vào đối tượng chính

    var textTexture = CreateTextTexture(dataItemAR.mapIconCode, dataItemAR.name);
    var textMaterial = new THREE.MeshBasicMaterial({ map: textTexture, transparent: true, side: THREE.DoubleSide });
    var textGeometry = new THREE.PlaneGeometry(sizeObject, 2);
    var textObject = new THREE.Mesh(textGeometry, textMaterial);
    textObject.position.set(0, heightText, 0);

    object.add(textObject);

    arrObject.push(object);
    object.position.set(itemPosition.x, camera.position.y, itemPosition.z)
    object.lookAt(grCamera ? grCamera.position : camera.position);
    //object.quaternion.setFromRotationMatrix(controller.matrixWorld);
    scene.add(object);
}
function CreateARObject5(dataItemAR, alphaState) {
    var sizeObject = 13;
    var heightText = 9;
    const itemPosition = ConvertPositionAndRotate(dataItemAR.latitude, dataItemAR.longitude, alphaState);
    var loader = new THREE.TextureLoader();
    var texture = loader.load(dataItemAR.src);
    var geometry = new THREE.PlaneGeometry(sizeObject, sizeObject);
    var material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    var object = new THREE.Mesh(geometry, material);
    object.userData.id = dataItemAR.mapIconCode;
    object.name = dataItemAR.name;


    var textTexture = CreateTextTexture3(dataItemAR.mapIconCode, dataItemAR.name);
    var textMaterial = new THREE.MeshBasicMaterial({ map: textTexture, transparent: true, side: THREE.DoubleSide });
    var textGeometry = new THREE.PlaneGeometry(sizeObject, 2);
    var textObject = new THREE.Mesh(textGeometry, textMaterial);
    textObject.position.set(0, heightText, 0);

    object.add(textObject);

    arrObject.push(object);
    object.position.set(itemPosition.x, camera.position.y, itemPosition.z)
    object.lookAt(grCamera ? grCamera.position : camera.position);
    //object.quaternion.setFromRotationMatrix(controller.matrixWorld);
    scene.add(object);
}
function CreateARObject6(dataItemAR, alphaState) {
    var sizeObject = 13;
    var heightText = 9;
    const itemPosition = ConvertPositionAndRotate(dataItemAR.latitude, dataItemAR.longitude, alphaState);
    var loader = new THREE.TextureLoader();
    var texture = loader.load(redArrowImg);
    var geometry = new THREE.PlaneGeometry(sizeObject, sizeObject);
    var material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    var object = new THREE.Mesh(geometry, material);
    object.userData.id = dataItemAR.mapIconCode;
    object.name = dataItemAR.name;


    var textTexture = CreateTextTexture3(dataItemAR.mapIconCode, dataItemAR.name);
    var textMaterial = new THREE.MeshBasicMaterial({ map: textTexture, transparent: true, side: THREE.DoubleSide });
    var textGeometry = new THREE.PlaneGeometry(sizeObject, 2);
    var textObject = new THREE.Mesh(textGeometry, textMaterial);
    textObject.position.set(0, heightText, 0);

    object.add(textObject);

    arrObject.push(object);
    object.position.set(itemPosition.x, camera.position.y, itemPosition.z)
    object.lookAt(grCamera ? grCamera.position : camera.position);
    //object.quaternion.setFromRotationMatrix(controller.matrixWorld);
    scene.add(object);
}
function animateJump(object) {
    var initialY = object.position.y;  // Lưu vị trí Y ban đầu
    function updateJump() {
        var time = Date.now() * 0.002; // Thời gian để tạo hiệu ứng động
        var jumpHeight = 1; // Chiều cao nhảy, bạn có thể điều chỉnh giá trị này

        // Cập nhật vị trí Y của đối tượng để tạo hiệu ứng nhảy
        object.position.y = initialY + Math.sin(time) * jumpHeight;

        requestAnimationFrame(updateJump);  // Gọi lại hàm này để tạo hiệu ứng liên tục
    }
    updateJump();  // Khởi chạy hiệu ứng nhảy
}
function convertGPSToWorldCoordinates(lat, lon) {
    const R = 6371000; // Earth's radius in meters

    const x = R * THREE.MathUtils.degToRad(lon);
    const z = R * Math.log(Math.tan(Math.PI / 4 + THREE.MathUtils.degToRad(lat) / 2));
    return { x : x, z : z};
}

function toCartesian(lat, lon, altitude = 0) {
    const a = 6378137.0; // Bán trục chính (m) của ellipsoid WGS84
    const f = 1 / 298.257223563; // Độ dẹt của ellipsoid WGS84
    const e2 = 2 * f - f * f; // Bình phương độ lệch tâm

    const latRad = THREE.MathUtils.degToRad(lat);
    const lonRad = THREE.MathUtils.degToRad(lon);

    const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) * Math.sin(latRad));

    const x = (N + altitude) * Math.cos(latRad) * Math.cos(lonRad);
    const y = (N + altitude) * Math.cos(latRad) * Math.sin(lonRad);
    const z = (N * (1 - e2) + altitude) * Math.sin(latRad);

    return new THREE.Vector3(x, y, z);
}
var arr1 = []
var arr2 = []
var arr3 = []
function ConvertPositionAndRotate(lat, lon, alpha) {
    var projectPos = proj4(wgs84, getUTMZone(parseFloat(lon)), [parseFloat(lon), parseFloat(lat)]);

    var translatedPoint = {
        x: projectPos[0] - initialPosition.x,
        z: -(projectPos[1] - initialPosition.z)
    };
    /*var rotatedPoint = rotateAroundYAxis(translatedPoint, alpha + Math.PI);*/
    arr1.push(`x1 = ${translatedPoint.x}, z1 = ${translatedPoint.z}\n`);
    const xdoubleprime = translatedpoint.x * math.cos(-alpha) + translatedpoint.z * math.sin(-alpha);
    const zdoubleprime = -translatedpoint.x * math.sin(-alpha) + translatedpoint.z * math.cos(-alpha );

    const xtripleprime = translatedpoint.x * math.cos(alpha) + translatedpoint.z * math.sin(alpha);
    const ztripleprime = -translatedpoint.x * math.sin(alpha) + translatedpoint.z * math.cos(alpha);

    translatedpoint = {
        x: xdoubleprime,
        z: zdoubleprime 
    }; 

    return translatedPoint;
}

function rotateAroundYAxis(point, alpha) {
    const cosAlpha = Math.cos(alpha);
    const sinAlpha = Math.sin(alpha);

    const xNew = point.x * cosAlpha - point.z * sinAlpha;
    const zNew = point.x * sinAlpha + point.z * cosAlpha;

    return { x: xNew, z: zNew };
}
function calculatorOrientEarth(mypoint) {   
    const northPoint = { latitude: 83.666667, longitude: -29.833333 };
    const equatorPoint = { latitude: 0, longitude: 0 };
    const distanceMyLocationToNorth = DistanceBetweenPoints(northPoint, mypoint);
    const distanceMyLocationToEquator = DistanceBetweenPoints(equatorPoint, mypoint);
    const distanceEquatorToNorth = DistanceBetweenPoints(northPoint, equatorPoint);
    const CosOfAngle = (distanceMyLocationToNorth * distanceMyLocationToNorth + distanceEquatorToNorth * distanceEquatorToNorth - distanceMyLocationToEquator * distanceMyLocationToEquator) / (2 * distanceMyLocationToNorth * distanceEquatorToNorth);
    return Math.acos(CosOfAngle);
}
function animate(timeshape, frame) {
    // alert(camera.position.x + " " + camera.position.y + " "+ camera.position.z);
    if (light) {
        light.position.copy(camera.position);
    }
    renderer.render(scene, camera);
}

function CheckDistanceObjectInterval() {
    if (!firstLoadGPS && arrObject.length > 0) {
        if (arrDistanceObject.length == 0) {
            for (var i = 0; i < arrObject.length; i++) {
                var distance = camera.position.distanceTo(arrObject[i].position);
                arrDistance.push(distance.toFixed(0));
                var textTexture = null;
                if (distance.toFixed(0) > minDistance) {
                    textTexture = CreateDistanceTexture(`${distance.toFixed(0)}メートル`, '#45A29E');
                }
                else {
                    textTexture = CreateDistanceTexture(`${distance.toFixed(0)}メートル`, 'red');
                }
                var textMaterial = new THREE.MeshBasicMaterial({ map: textTexture, transparent: true, side: THREE.DoubleSide });
                var textGeometry = new THREE.PlaneGeometry(sizeText, 0.5);
                var textObject = new THREE.Mesh(textGeometry, textMaterial);
                textObject.position.set(0, heightText + 0.75, 0);
                arrObject[i].add(textObject);
                arrDistanceObject.push(textObject);
            }
        } else {
            for (var i = 0; i < arrObject.length; i++) {
                var distance = camera.position.distanceTo(arrObject[i].position);
                if (distance.toFixed(0) != arrDistance[i]) {
                    arrDistance[i] = distance.toFixed(0);
                    var textTexture = null;
                    if (distance.toFixed(0) > minDistance) {
                        textTexture = CreateDistanceTexture(`${distance.toFixed(0)}メートル`, '#45A29E');
                    }
                    else {
                        textTexture = CreateDistanceTexture(`${distance.toFixed(0)}メートル`, 'red');
                    }
                    var textMaterial = new THREE.MeshBasicMaterial({ map: textTexture, transparent: true, side: THREE.DoubleSide });
                    arrDistanceObject[i].material = textMaterial;
                }
            }
        }
    }
}

function DistanceBetweenPoints(pointA, pointB) {
    var distance = google.maps.geometry.spherical.computeDistanceBetween(new google.maps.LatLng(pointA.latitude, pointA.longitude), new google.maps.LatLng(pointB.latitude, pointB.longitude));
    return distance;
}

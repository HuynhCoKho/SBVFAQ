import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js';

var canvas = document.getElementById('fxCanvas');

if (canvas) {
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0.6, 7);

  var renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: true
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  var group = new THREE.Group();
  scene.add(group);

  var globeGeometry = new THREE.SphereGeometry(1.55, 48, 32);
  var globeMaterial = new THREE.MeshBasicMaterial({
    color: 0x0f7a68,
    wireframe: true,
    transparent: true,
    opacity: 0.16
  });
  var globe = new THREE.Mesh(globeGeometry, globeMaterial);
  globe.position.set(2.4, 0.15, -0.4);
  group.add(globe);

  var ringMaterial = new THREE.LineBasicMaterial({
    color: 0x0b5f52,
    transparent: true,
    opacity: 0.2
  });

  for (var i = 0; i < 4; i += 1) {
    var ringCurve = new THREE.EllipseCurve(0, 0, 2.05 + i * 0.22, 0.75 + i * 0.08, 0, Math.PI * 2);
    var ringPoints = ringCurve.getPoints(96).map(function (point) {
      return new THREE.Vector3(point.x, point.y, 0);
    });
    var ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ringPoints), ringMaterial);
    ring.rotation.x = Math.PI / 2.7;
    ring.rotation.y = i * 0.28;
    ring.position.copy(globe.position);
    group.add(ring);
  }

  var nodeGeometry = new THREE.SphereGeometry(0.035, 12, 12);
  var nodeMaterial = new THREE.MeshBasicMaterial({
    color: 0x0f7a68,
    transparent: true,
    opacity: 0.52
  });

  var nodes = [];
  for (var n = 0; n < 54; n += 1) {
    var node = new THREE.Mesh(nodeGeometry, nodeMaterial);
    var angle = n * 0.72;
    var radius = 2.2 + (n % 9) * 0.18;
    node.position.set(
      Math.cos(angle) * radius - 1.3,
      Math.sin(angle * 0.7) * 1.2 + ((n % 5) - 2) * 0.18,
      -1.2 + Math.sin(angle) * 0.9
    );
    nodes.push(node);
    group.add(node);
  }

  var lineMaterial = new THREE.LineBasicMaterial({
    color: 0x6fb7aa,
    transparent: true,
    opacity: 0.13
  });

  for (var l = 0; l < nodes.length - 1; l += 2) {
    var line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        nodes[l].position,
        nodes[(l + 7) % nodes.length].position
      ]),
      lineMaterial
    );
    group.add(line);
  }

  var clock = new THREE.Clock();

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  window.addEventListener('resize', resize);

  function animate() {
    var elapsed = clock.getElapsedTime();
    group.rotation.y = elapsed * 0.035;
    globe.rotation.y = elapsed * 0.12;
    globe.rotation.x = Math.sin(elapsed * 0.3) * 0.08;

    nodes.forEach(function (node, index) {
      node.position.y += Math.sin(elapsed + index) * 0.0008;
    });

    renderer.render(scene, camera);
    window.requestAnimationFrame(animate);
  }

  animate();
}

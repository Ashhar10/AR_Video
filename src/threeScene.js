import * as THREE from 'three';

export class ThreeSceneManager {
  constructor(canvasContainer, videoElement) {
    this.container = canvasContainer;
    this.video = videoElement;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.videoTexture = null;

    // Banner Meshes & Groups
    this.bannerGroup = new THREE.Group();
    this.curvedGroup = null;
    this.flatGroup = null;
    this.cylinderGroup = null;
    this.cubeGroup = null;
    this.screenGlowLight = null;

    // Floor (NO particles)
    this.floorGroup = new THREE.Group();

    // Modes: 'curved3d' | 'flat2d' | 'cylinder' | 'cube3d' | 'theater' | 'ar'
    this.currentMode = 'curved3d';

    // Camera targets for smooth lerping
    this.targetCameraPos = new THREE.Vector3(0, 0.1, 7.2);
    this.targetLookAt = new THREE.Vector3(0, 0, 0);
    this.currentLookAt = new THREE.Vector3(0, 0, 0);

    // Interaction controls (Full 360 rotation)
    this.isDragging = false;
    this.previousMousePosition = { x: 0, y: 0 };
    this.rotationVelocity = { x: 0, y: 0 };
    this.autoRotate = false;
    this.bannerRotation = { x: 0, y: 0 };

    // Pinch zoom / scale
    this.currentScale = 1.0;
    this.initialPinchDistance = null;

    // ========================================================
    // AR STATE
    // ========================================================
    this.arMediaStream = null;
    this.isARActive = false;
    this.arMode = null; // 'webxr' | 'fallback'
    this.arReticle = null;
    this.arReticleInner = null;
    this.arPlaneDetected = false;
    this.arBannerPlaced = false;

    // WebXR state
    this.xrSession = null;
    this.xrRefSpace = null;
    this.xrHitTestSource = null;

    // Fallback AR: device orientation tracking
    this.useDeviceOrientation = false;
    this.deviceOrientationData = { alpha: 0, beta: 0, gamma: 0, orient: 0 };
    this._deviceOrientationCleanup = null;
    // Helpers for quaternion calculation
    this._arZee = new THREE.Vector3(0, 0, 1);
    this._arEuler = new THREE.Euler();
    this._arQ0 = new THREE.Quaternion();
    this._arQ1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

    // AR UI Callbacks
    this.arCallbacks = {};

    this.init();
  }

  init() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0c10);
    this.scene.fog = new THREE.FogExp2(0x0a0c10, 0.04);

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.copy(this.targetCameraPos);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.xr.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    // 4. Video Texture
    this.setupVideoTexture();

    // 5. Lighting
    this.setupLighting();

    // 6. Environment & Floor (NO particles)
    this.setupEnvironment();

    // 7. Banner Models (video meshes only)
    this.scene.add(this.bannerGroup);
    this.createBannerMeshes();

    // 8. Planar Detection Reticle (for AR)
    this.createARReticle();

    // Default mode
    this.setMode('curved3d');

    // 9. Event Listeners
    this.setupEventListeners();

    // 10. Render Loop
    this.animate = this.animate.bind(this);
    this.renderer.setAnimationLoop(this.animate);
  }

  setupVideoTexture() {
    this.videoTexture = new THREE.VideoTexture(this.video);
    this.videoTexture.colorSpace = THREE.SRGBColorSpace;
    this.videoTexture.minFilter = THREE.LinearFilter;
    this.videoTexture.magFilter = THREE.LinearFilter;
    this.videoTexture.generateMipmaps = false;
  }

  setupLighting() {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(this.ambientLight);

    this.spotLight = new THREE.SpotLight(0xffeedd, 2.5);
    this.spotLight.position.set(0, 8, 8);
    this.spotLight.angle = Math.PI / 4;
    this.spotLight.penumbra = 0.8;
    this.spotLight.decay = 1.5;
    this.spotLight.distance = 25;
    this.spotLight.castShadow = true;
    this.spotLight.shadow.mapSize.width = 1024;
    this.spotLight.shadow.mapSize.height = 1024;
    this.scene.add(this.spotLight);

    this.rimLight1 = new THREE.DirectionalLight(0xf39c12, 1.2);
    this.rimLight1.position.set(-6, 4, -4);
    this.scene.add(this.rimLight1);

    this.rimLight2 = new THREE.DirectionalLight(0xc0392b, 1.2);
    this.rimLight2.position.set(6, 4, -4);
    this.scene.add(this.rimLight2);

    this.screenGlowLight = new THREE.PointLight(0xff3366, 1.5, 8);
    this.screenGlowLight.position.set(0, 0, 1.2);
    this.scene.add(this.screenGlowLight);
  }

  setupEnvironment() {
    this.scene.add(this.floorGroup);

    const floorGeo = new THREE.PlaneGeometry(32, 32);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.25, metalness: 0.8 });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -2.1;
    floorMesh.receiveShadow = true;
    this.floorGroup.add(floorMesh);

    const ringGeo = new THREE.RingGeometry(3.2, 3.25, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xf39c12, side: THREE.DoubleSide, transparent: true, opacity: 0.4 });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = -2.09;
    this.floorGroup.add(ringMesh);

    const outerRingGeo = new THREE.RingGeometry(4.8, 4.83, 64);
    const outerRingMat = new THREE.MeshBasicMaterial({ color: 0xc0392b, side: THREE.DoubleSide, transparent: true, opacity: 0.25 });
    const outerRingMesh = new THREE.Mesh(outerRingGeo, outerRingMat);
    outerRingMesh.rotation.x = -Math.PI / 2;
    outerRingMesh.position.y = -2.09;
    this.floorGroup.add(outerRingMesh);
  }

  createCurvedBannerGeometry(width, height, curvatureDepth, segmentsX = 48, segmentsY = 16) {
    const geo = new THREE.PlaneGeometry(width, height, segmentsX, segmentsY);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const normX = x / (width / 2);
      const z = (1 - Math.cos(normX * Math.PI * 0.28)) * curvatureDepth;
      pos.setZ(i, z);
    }
    geo.computeVertexNormals();
    return geo;
  }

  createBannerMeshes() {
    const bannerWidth = 6.2;
    const bannerHeight = bannerWidth * (9 / 16);

    const screenMaterial = new THREE.MeshBasicMaterial({ map: this.videoTexture, side: THREE.DoubleSide });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x161a22, metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide });
    const goldTrimMat = new THREE.MeshBasicMaterial({ color: 0xf1c40f });

    // 1. CURVED 3D BANNER
    this.curvedGroup = new THREE.Group();
    const curvedGeo = this.createCurvedBannerGeometry(bannerWidth, bannerHeight, 0.75);
    const curvedScreenMesh = new THREE.Mesh(curvedGeo, screenMaterial);
    this.curvedGroup.add(curvedScreenMesh);
    const curvedFrameGeo = this.createCurvedBannerGeometry(bannerWidth + 0.24, bannerHeight + 0.24, 0.75);
    const curvedFrameMesh = new THREE.Mesh(curvedFrameGeo, frameMat);
    curvedFrameMesh.position.set(0, 0, -0.06);
    this.curvedGroup.add(curvedFrameMesh);
    const topBarGeo = new THREE.BoxGeometry(bannerWidth + 0.28, 0.04, 0.06);
    const topBar = new THREE.Mesh(topBarGeo, goldTrimMat);
    topBar.position.set(0, bannerHeight / 2 + 0.1, 0.15);
    this.curvedGroup.add(topBar);
    const bottomBar = new THREE.Mesh(topBarGeo, goldTrimMat);
    bottomBar.position.set(0, -bannerHeight / 2 - 0.1, 0.15);
    this.curvedGroup.add(bottomBar);
    const standGeo = new THREE.CylinderGeometry(0.08, 0.12, 1.6, 16);
    const standMat = new THREE.MeshStandardMaterial({ color: 0x22262d, metalness: 0.85, roughness: 0.3 });
    const standL = new THREE.Mesh(standGeo, standMat);
    standL.position.set(-2.2, -bannerHeight / 2 - 0.8, 0);
    const standR = new THREE.Mesh(standGeo, standMat);
    standR.position.set(2.2, -bannerHeight / 2 - 0.8, 0);
    this.curvedGroup.add(standL);
    this.curvedGroup.add(standR);
    this.bannerGroup.add(this.curvedGroup);

    // 2. FLAT 2D BANNER
    this.flatGroup = new THREE.Group();
    const flatScreenGeo = new THREE.PlaneGeometry(bannerWidth, bannerHeight);
    const flatScreenMesh = new THREE.Mesh(flatScreenGeo, screenMaterial);
    this.flatGroup.add(flatScreenMesh);
    const flatFrameGeo = new THREE.BoxGeometry(bannerWidth + 0.22, bannerHeight + 0.22, 0.08);
    const flatFrameMesh = new THREE.Mesh(flatFrameGeo, frameMat);
    flatFrameMesh.position.set(0, 0, -0.05);
    this.flatGroup.add(flatFrameMesh);
    const flatTrimGeo = new THREE.BoxGeometry(bannerWidth + 0.26, bannerHeight + 0.26, 0.02);
    const flatTrim = new THREE.Mesh(flatTrimGeo, goldTrimMat);
    flatTrim.position.set(0, 0, -0.1);
    this.flatGroup.add(flatTrim);
    this.bannerGroup.add(this.flatGroup);

    // 3. 360 CYLINDER COLUMN
    this.cylinderGroup = new THREE.Group();
    const colRadius = 1.9;
    const colHeight = 3.5;
    const colGeo = new THREE.CylinderGeometry(colRadius, colRadius, colHeight, 64, 1, false);
    const colMesh = new THREE.Mesh(colGeo, screenMaterial);
    this.cylinderGroup.add(colMesh);
    const colCapGeo = new THREE.CylinderGeometry(colRadius + 0.12, colRadius + 0.12, 0.14, 32);
    const colCapTop = new THREE.Mesh(colCapGeo, frameMat);
    colCapTop.position.set(0, colHeight / 2 + 0.07, 0);
    const colCapBottom = new THREE.Mesh(colCapGeo, frameMat);
    colCapBottom.position.set(0, -colHeight / 2 - 0.07, 0);
    this.cylinderGroup.add(colCapTop);
    this.cylinderGroup.add(colCapBottom);
    this.bannerGroup.add(this.cylinderGroup);

    // 4. HOLOGRAPHIC 3D CUBE
    this.cubeGroup = new THREE.Group();
    const cubeSize = 3.0;
    const cubeGeo = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
    const cubeMesh = new THREE.Mesh(cubeGeo, screenMaterial);
    this.cubeGroup.add(cubeMesh);
    const wireGeo = new THREE.BoxGeometry(cubeSize + 0.08, cubeSize + 0.08, cubeSize + 0.08);
    const wireMat = new THREE.MeshBasicMaterial({ color: 0xf39c12, wireframe: true, transparent: true, opacity: 0.6 });
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    this.cubeGroup.add(wireMesh);
    this.bannerGroup.add(this.cubeGroup);
  }

  // ========================================================
  // AR RETICLE (horizontal planar detection indicator)
  // ========================================================
  createARReticle() {
    this.arReticle = new THREE.Group();

    const ringGeo = new THREE.RingGeometry(0.38, 0.42, 48);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    this.arReticle.add(ring);

    const innerRingGeo = new THREE.RingGeometry(0.18, 0.20, 36);
    const innerRingMat = new THREE.MeshBasicMaterial({ color: 0xf1c40f, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
    this.arReticleInner = new THREE.Mesh(innerRingGeo, innerRingMat);
    this.arReticleInner.rotation.x = -Math.PI / 2;
    this.arReticle.add(this.arReticleInner);

    const tickMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const tickGeo = new THREE.PlaneGeometry(0.03, 0.16);
      const tick = new THREE.Mesh(tickGeo, tickMat);
      tick.rotation.x = -Math.PI / 2;
      tick.rotation.z = angle;
      tick.position.x = Math.cos(angle) * 0.48;
      tick.position.z = Math.sin(angle) * 0.48;
      this.arReticle.add(tick);
    }

    const centerGeo = new THREE.CircleGeometry(0.04, 24);
    const centerMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const center = new THREE.Mesh(centerGeo, centerMat);
    center.rotation.x = -Math.PI / 2;
    this.arReticle.add(center);

    const gridGeo = new THREE.CircleGeometry(0.75, 24);
    const gridMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71, wireframe: true, transparent: true, opacity: 0.28, side: THREE.DoubleSide });
    const gridMesh = new THREE.Mesh(gridGeo, gridMat);
    gridMesh.rotation.x = -Math.PI / 2;
    gridMesh.position.y = -0.003;
    this.arReticle.add(gridMesh);

    this.arReticle.visible = false;
    this.scene.add(this.arReticle);
  }

  setMode(mode) {
    this.currentMode = mode;
    this.curvedGroup.visible = (mode === 'curved3d' || mode === 'theater' || mode === 'ar');
    this.flatGroup.visible = (mode === 'flat2d');
    this.cylinderGroup.visible = (mode === 'cylinder');
    this.cubeGroup.visible = (mode === 'cube3d');

    if (mode === 'theater') {
      this.bannerRotation.x = 0;
      this.bannerRotation.y = 0;
      this.rotationVelocity.x = 0;
      this.rotationVelocity.y = 0;
      this.bannerGroup.rotation.set(0, 0, 0);
      this.bannerGroup.position.set(0, 0, 0);
      this.autoRotate = false;
      this.ambientLight.intensity = 0.25;
      this.spotLight.intensity = 1.0;
    } else if (mode === 'flat2d') {
      this.ambientLight.intensity = 0.8;
      this.spotLight.intensity = 2.8;
      this.bannerRotation.x = 0;
      this.bannerRotation.y = 0;
      this.bannerGroup.rotation.set(0, 0, 0);
    } else if (mode === 'ar') {
      this.ambientLight.intensity = 1.2;
      this.spotLight.intensity = 1.8;
    } else {
      this.ambientLight.intensity = 0.7;
      this.spotLight.intensity = 2.5;
    }

    if (mode !== 'ar') {
      this.updateCameraForScreen();
    }
  }

  updateCameraForScreen() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const aspect = width / height;
    this.camera.aspect = aspect;
    const fovRad = (this.camera.fov * Math.PI) / 360;
    const bannerW = 6.6;

    if (aspect < 1.0) {
      const distForWidth = bannerW / (2 * Math.tan(fovRad) * aspect);
      if (this.currentMode === 'theater') {
        this.targetCameraPos.set(0, 0, Math.max(5.0, distForWidth * 0.95));
        this.targetLookAt.set(0, 0, 0);
      } else if (this.currentMode === 'curved3d' || this.currentMode === 'flat2d') {
        this.targetCameraPos.set(0, 0.1, Math.max(7.2, distForWidth * 1.05));
        this.targetLookAt.set(0, 0.1, 0);
      } else if (this.currentMode === 'cylinder') {
        this.targetCameraPos.set(0, 0.1, Math.max(6.8, distForWidth * 0.85));
        this.targetLookAt.set(0, 0.1, 0);
      } else if (this.currentMode === 'cube3d') {
        this.targetCameraPos.set(2.8, 1.8, Math.max(6.2, distForWidth * 0.9));
        this.targetLookAt.set(0, 0.1, 0);
      }
    } else {
      if (this.currentMode === 'theater') {
        this.targetCameraPos.set(0, 0, 4.4);
        this.targetLookAt.set(0, 0, 0);
      } else if (this.currentMode === 'curved3d') {
        this.targetCameraPos.set(0, 0.2, 7.2);
        this.targetLookAt.set(0, 0.1, 0);
      } else if (this.currentMode === 'flat2d') {
        this.targetCameraPos.set(0, 0.2, 7.5);
        this.targetLookAt.set(0, 0.2, 0);
      } else if (this.currentMode === 'cylinder') {
        this.targetCameraPos.set(0, 0.2, 6.8);
        this.targetLookAt.set(0, 0.2, 0);
      } else if (this.currentMode === 'cube3d') {
        this.targetCameraPos.set(3.2, 2.2, 6.2);
        this.targetLookAt.set(0, 0.2, 0);
      }
    }
    this.camera.updateProjectionMatrix();
  }

  // ========================================================
  // SCALE UP, DOWN, RESET
  // ========================================================
  scaleUp() {
    this.currentScale = Math.min(3.5, this.currentScale + 0.15);
    this.bannerGroup.scale.setScalar(this.currentScale);
  }

  scaleDown() {
    this.currentScale = Math.max(0.15, this.currentScale - 0.15);
    this.bannerGroup.scale.setScalar(this.currentScale);
  }

  resetView() {
    this.currentScale = this.isARActive ? 0.35 : 1.0;
    this.bannerGroup.scale.setScalar(this.currentScale);
    if (!this.isARActive) {
      this.bannerGroup.position.set(0, 0, 0);
      this.bannerRotation.x = 0;
      this.bannerRotation.y = 0;
      this.rotationVelocity.x = 0;
      this.rotationVelocity.y = 0;
      this.bannerGroup.rotation.set(0, 0, 0);
      this.setMode(this.currentMode);
    }
  }

  // ========================================================
  // AR MODE - WEBXR PRIMARY, DEVICE ORIENTATION FALLBACK
  // ========================================================
  async startAR(callbacks = {}) {
    this.arCallbacks = callbacks;
    this.isARActive = true;
    this.arBannerPlaced = false;
    this.arPlaneDetected = false;

    // Prepare scene for AR: transparent background
    this.scene.background = null;
    this.renderer.setClearAlpha(0);
    this.floorGroup.visible = false;
    this.container.classList.add('ar-active');

    // Only the curved video mesh in AR
    this.curvedGroup.visible = true;
    this.flatGroup.visible = false;
    this.cylinderGroup.visible = false;
    this.cubeGroup.visible = false;

    // AR scale and hide banner until placed
    this.currentScale = 0.35;
    this.bannerGroup.scale.setScalar(this.currentScale);
    this.bannerGroup.visible = false;
    this.arReticle.visible = false;

    this.setMode('ar');

    // PATH 1: Try WebXR immersive-ar (Android Chrome with ARCore)
    if (navigator.xr) {
      try {
        const isSupported = await navigator.xr.isSessionSupported('immersive-ar');
        if (isSupported) {
          await this.startWebXRAR();
          return;
        }
      } catch (e) {
        console.log('WebXR not available:', e);
      }
    }

    // PATH 2: Fallback with camera feed + device orientation gyroscope
    await this.startFallbackAR();
  }

  // ========================================================
  // PATH 1: WEBXR IMMERSIVE-AR WITH HIT-TEST
  // The XR system controls the camera. Objects stay in 3D world.
  // ========================================================
  async startWebXRAR() {
    this.arMode = 'webxr';

    try {
      const sessionInit = {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.body }
      };

      const session = await navigator.xr.requestSession('immersive-ar', sessionInit);
      this.xrSession = session;

      this.renderer.xr.setReferenceSpaceType('local');
      await this.renderer.xr.setSession(session);

      // Setup hit-test for horizontal plane detection
      const viewerSpace = await session.requestReferenceSpace('viewer');
      this.xrRefSpace = await session.requestReferenceSpace('local');
      this.xrHitTestSource = await session.requestHitTestSource({ space: viewerSpace });

      // XR select (tap in AR) places the banner
      session.addEventListener('select', () => {
        if (this.arReticle.visible && !this.arBannerPlaced) {
          this.placeBannerOnSurface();
        }
      });

      session.addEventListener('end', () => {
        this.xrSession = null;
        this.xrHitTestSource = null;
        this.xrRefSpace = null;
        this.arMode = null;
        if (this.isARActive) {
          this.isARActive = false;
          this.restoreNormalMode();
        }
      });

      if (this.arCallbacks.onSuccess) this.arCallbacks.onSuccess();
    } catch (e) {
      console.warn('WebXR session failed, falling back:', e);
      await this.startFallbackAR();
    }
  }

  // ========================================================
  // PATH 2: FALLBACK AR - CAMERA FEED + DEVICE ORIENTATION
  // Camera rotation tracks the phone gyroscope so objects
  // stay anchored in 3D world space as you move the phone.
  // ========================================================
  async startFallbackAR() {
    this.arMode = 'fallback';

    // Get camera feed
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      this.arMediaStream = stream;
      const videoFeed = document.getElementById('ar-camera-feed');
      if (videoFeed) {
        videoFeed.srcObject = stream;
        videoFeed.classList.add('active');
        await videoFeed.play();
      }
    } catch (e) {
      console.warn('Camera not available:', e);
      this.scene.background = new THREE.Color(0x111111);
    }

    // Position camera at standing eye height looking forward
    this.camera.position.set(0, 1.6, 0);
    this.camera.rotation.set(0, 0, 0);
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();

    // Setup gyroscope-based camera rotation
    await this.initDeviceOrientation();

    // Place reticle on the ground plane in front of the user
    this.arReticle.position.set(0, 0, -2.0);
    this.arReticle.visible = true;
    this.arPlaneDetected = true;

    if (this.arCallbacks.onSuccess) this.arCallbacks.onSuccess();
    if (this.arCallbacks.onPlaneDetected) this.arCallbacks.onPlaneDetected(true);
  }

  async initDeviceOrientation() {
    // iOS 13+ needs explicit permission request
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const state = await DeviceOrientationEvent.requestPermission();
        if (state === 'granted') {
          this.enableDeviceOrientationTracking();
        }
      } catch (e) {
        console.warn('DeviceOrientation permission denied:', e);
      }
    } else if (typeof DeviceOrientationEvent !== 'undefined') {
      this.enableDeviceOrientationTracking();
    }
  }

  enableDeviceOrientationTracking() {
    this.useDeviceOrientation = true;
    this.deviceOrientationData = { alpha: 0, beta: 0, gamma: 0, orient: 0 };

    const onOrientation = (e) => {
      if (e.alpha !== null) {
        this.deviceOrientationData.alpha = e.alpha;
        this.deviceOrientationData.beta = e.beta;
        this.deviceOrientationData.gamma = e.gamma;
      }
    };
    const onOrientChange = () => {
      this.deviceOrientationData.orient = window.orientation || 0;
    };

    window.addEventListener('deviceorientation', onOrientation);
    window.addEventListener('orientationchange', onOrientChange);
    onOrientChange();

    this._deviceOrientationCleanup = () => {
      window.removeEventListener('deviceorientation', onOrientation);
      window.removeEventListener('orientationchange', onOrientChange);
    };
  }

  // Standard device-orientation to Three.js quaternion conversion.
  // Makes the Three.js camera track the phone's real-world orientation
  // so that 3D objects appear anchored in the physical room.
  updateCameraFromDeviceOrientation() {
    const { alpha, beta, gamma, orient } = this.deviceOrientationData;
    const alphaRad = THREE.MathUtils.degToRad(alpha);
    const betaRad = THREE.MathUtils.degToRad(beta);
    const gammaRad = THREE.MathUtils.degToRad(gamma);
    const orientRad = THREE.MathUtils.degToRad(orient);

    // YXZ Euler -> quaternion, then rotate -90deg around X (phone upright),
    // then compensate for screen orientation.
    this._arEuler.set(betaRad, alphaRad, -gammaRad, 'YXZ');
    this.camera.quaternion.setFromEuler(this._arEuler);
    this.camera.quaternion.multiply(this._arQ1);
    this.camera.quaternion.multiply(this._arQ0.setFromAxisAngle(this._arZee, -orientRad));
  }

  // ========================================================
  // BANNER PLACEMENT ON DETECTED HORIZONTAL SURFACE
  // ========================================================
  placeBannerOnSurface() {
    if (!this.isARActive) return;

    // Copy the reticle's world position
    const targetPos = this.arReticle.position.clone();
    const bannerHeight = 3.48 * this.currentScale;

    // Stand the banner on the surface
    this.bannerGroup.position.set(targetPos.x, targetPos.y + bannerHeight / 2, targetPos.z);

    // Face the camera at moment of placement, then stay fixed in world
    const camWorldPos = new THREE.Vector3();
    this.camera.getWorldPosition(camWorldPos);
    this.bannerGroup.lookAt(camWorldPos.x, this.bannerGroup.position.y, camWorldPos.z);

    this.bannerGroup.visible = true;
    this.arBannerPlaced = true;
    this.arReticle.visible = false;

    if (this.arCallbacks.onBannerPlaced) this.arCallbacks.onBannerPlaced();
  }

  repositionBanner() {
    if (!this.isARActive) return;
    this.arBannerPlaced = false;
    this.arReticle.visible = true;
    this.bannerGroup.visible = false;
  }

  stopAR() {
    this.isARActive = false;
    this.arBannerPlaced = false;
    this.arPlaneDetected = false;

    // End WebXR session if active
    if (this.xrSession) {
      this.xrSession.end().catch(() => {});
      this.xrSession = null;
      this.xrHitTestSource = null;
      this.xrRefSpace = null;
    }
    this.arMode = null;

    // Stop camera stream
    if (this.arMediaStream) {
      this.arMediaStream.getTracks().forEach(t => t.stop());
      this.arMediaStream = null;
    }
    const videoFeed = document.getElementById('ar-camera-feed');
    if (videoFeed) {
      videoFeed.srcObject = null;
      videoFeed.classList.remove('active');
    }

    // Clean up device orientation
    if (this._deviceOrientationCleanup) {
      this._deviceOrientationCleanup();
      this._deviceOrientationCleanup = null;
    }
    this.useDeviceOrientation = false;

    if (this.arReticle) this.arReticle.visible = false;
    this.restoreNormalMode();
  }

  restoreNormalMode() {
    this.scene.background = new THREE.Color(0x0a0c10);
    this.renderer.setClearAlpha(1);
    this.floorGroup.visible = true;
    this.container.classList.remove('ar-active');

    this.bannerGroup.visible = true;
    this.bannerGroup.position.set(0, 0, 0);
    this.bannerGroup.rotation.set(0, 0, 0);
    this.bannerRotation.x = 0;
    this.bannerRotation.y = 0;
    this.currentScale = 1.0;
    this.bannerGroup.scale.setScalar(1);

    this.setMode('curved3d');
  }

  // ========================================================
  // INTERACTION & CONTROLS (ROTATION ALL OVER & PINCH SCALE)
  // ========================================================
  setupEventListeners() {
    const el = this.renderer.domElement;

    const onPointerDown = (e) => {
      if (e.target !== el) return;
      this.isDragging = true;
      this.previousMousePosition = {
        x: e.clientX || (e.touches && e.touches[0].clientX) || 0,
        y: e.clientY || (e.touches && e.touches[0].clientY) || 0
      };
      if (e.touches && e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        this.initialPinchDistance = Math.hypot(dx, dy);
      }
    };

    const onPointerMove = (e) => {
      // Pinch to scale
      if (e.touches && e.touches.length === 2 && this.initialPinchDistance) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const factor = dist / this.initialPinchDistance;
        const minScale = this.isARActive ? 0.1 : 0.3;
        const maxScale = this.isARActive ? 2.5 : 3.5;
        this.currentScale = Math.max(minScale, Math.min(maxScale, this.currentScale * (factor > 1 ? 1.03 : 0.97)));
        this.bannerGroup.scale.setScalar(this.currentScale);
        this.initialPinchDistance = dist;
        return;
      }

      if (!this.isDragging) return;
      if (this.currentMode === 'theater') return;

      const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      const clientY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
      const deltaX = clientX - this.previousMousePosition.x;
      const deltaY = clientY - this.previousMousePosition.y;

      if (this.isARActive && this.arBannerPlaced && this.arMode === 'fallback') {
        // Drag to slide banner on the ground plane
        this.bannerGroup.position.x += deltaX * 0.005;
        this.bannerGroup.position.z += deltaY * 0.005;
      } else if (!this.isARActive) {
        // Full 360-degree rotation
        const sensitivity = 0.0055;
        this.rotationVelocity.y = deltaX * sensitivity;
        this.rotationVelocity.x = deltaY * sensitivity;
        this.bannerRotation.y += this.rotationVelocity.y;
        this.bannerRotation.x += this.rotationVelocity.x;
        this.bannerRotation.x = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, this.bannerRotation.x));
      }

      this.previousMousePosition = { x: clientX, y: clientY };
    };

    const onPointerUp = (e) => {
      // Quick tap in fallback AR to place banner
      if (this.isARActive && !this.arBannerPlaced && this.arPlaneDetected && this.arMode === 'fallback') {
        const prevX = this.previousMousePosition.x;
        const cX = (e && e.clientX) || (e && e.changedTouches && e.changedTouches[0] && e.changedTouches[0].clientX) || prevX;
        if (Math.abs(cX - prevX) < 15) {
          this.placeBannerOnSurface();
        }
      }
      this.isDragging = false;
      this.initialPinchDistance = null;
    };

    el.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    el.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('touchend', onPointerUp);

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.currentMode === 'theater') return;
      if (e.deltaY < 0) this.scaleUp();
      else this.scaleDown();
    }, { passive: false });

    window.addEventListener('resize', () => this.onWindowResize());
  }

  onWindowResize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    if (!this.isARActive) {
      this.updateCameraForScreen();
    } else {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
  }

  // ========================================================
  // RENDER LOOP
  // ========================================================
  animate(timestamp, frame) {
    // ---- AR MODE ----
    if (this.isARActive) {

      // WEBXR PATH: Camera is auto-controlled by XR system.
      // Objects stay in real-world 3D space automatically.
      if (this.arMode === 'webxr' && frame && this.renderer.xr.isPresenting) {
        if (this.xrHitTestSource && !this.arBannerPlaced) {
          const hitResults = frame.getHitTestResults(this.xrHitTestSource);
          if (hitResults.length > 0) {
            const hit = hitResults[0];
            const hitPose = hit.getPose(this.xrRefSpace);
            if (hitPose) {
              const hitMatrix = new THREE.Matrix4();
              hitMatrix.fromArray(hitPose.transform.matrix);
              const _tempScale = new THREE.Vector3();
              hitMatrix.decompose(this.arReticle.position, this.arReticle.quaternion, _tempScale);
              this.arReticle.visible = true;

              if (!this.arPlaneDetected) {
                this.arPlaneDetected = true;
                if (this.arCallbacks.onPlaneDetected) this.arCallbacks.onPlaneDetected(true);
              }
            }
          } else {
            this.arReticle.visible = false;
          }
        }
      }

      // FALLBACK PATH: Camera rotation follows device gyroscope.
      // Objects stay anchored in 3D world because camera moves, not the objects.
      else if (this.arMode === 'fallback') {
        if (this.useDeviceOrientation) {
          this.updateCameraFromDeviceOrientation();
        }

        // Raycast from camera center to ground plane (y=0) for reticle
        if (!this.arBannerPlaced) {
          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
          const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
          const hitPoint = new THREE.Vector3();
          if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
            // Clamp distance so reticle does not fly to infinity
            const dist = hitPoint.distanceTo(this.camera.position);
            if (dist < 8) {
              this.arReticle.position.copy(hitPoint);
              this.arReticle.visible = true;
            } else {
              const camDir = new THREE.Vector3();
              this.camera.getWorldDirection(camDir);
              camDir.y = 0;
              camDir.normalize();
              this.arReticle.position.copy(this.camera.position).add(camDir.multiplyScalar(2.5));
              this.arReticle.position.y = 0;
              this.arReticle.visible = true;
            }
          } else {
            // Camera looking up; show reticle at default ground position
            const camDir = new THREE.Vector3();
            this.camera.getWorldDirection(camDir);
            camDir.y = 0;
            camDir.normalize();
            this.arReticle.position.copy(this.camera.position).add(camDir.multiplyScalar(2.5));
            this.arReticle.position.y = 0;
            this.arReticle.visible = true;
          }
        }
      }

      // Reticle pulse animation
      if (this.arReticle.visible && !this.arBannerPlaced && this.arReticleInner) {
        const pulse = 1 + Math.sin(Date.now() * 0.006) * 0.15;
        this.arReticleInner.scale.set(pulse, pulse, 1);
        this.arReticle.rotation.y += 0.012;
      }

      // BANNER IS ANCHORED IN WORLD SPACE - NO lookAt camera!
      // It stays where it was placed. Moving the phone reveals different angles.

    }
    // ---- NORMAL 3D MODES ----
    else if (this.currentMode === 'theater') {
      this.bannerGroup.rotation.set(0, 0, 0);

      this.camera.position.x += (this.targetCameraPos.x - this.camera.position.x) * 0.08;
      this.camera.position.y += (this.targetCameraPos.y - this.camera.position.y) * 0.08;
      this.camera.position.z += (this.targetCameraPos.z - this.camera.position.z) * 0.08;
      this.currentLookAt.lerp(this.targetLookAt, 0.08);
      this.camera.lookAt(this.currentLookAt);
    } else {
      if (!this.isDragging) {
        this.rotationVelocity.x *= 0.92;
        this.rotationVelocity.y *= 0.92;
        this.bannerRotation.x += this.rotationVelocity.x;
        this.bannerRotation.y += this.rotationVelocity.y;
      }
      this.bannerGroup.rotation.y = this.bannerRotation.y;
      this.bannerGroup.rotation.x = this.bannerRotation.x;

      this.camera.position.x += (this.targetCameraPos.x - this.camera.position.x) * 0.08;
      this.camera.position.y += (this.targetCameraPos.y - this.camera.position.y) * 0.08;
      this.camera.position.z += (this.targetCameraPos.z - this.camera.position.z) * 0.08;
      this.currentLookAt.lerp(this.targetLookAt, 0.08);
      this.camera.lookAt(this.currentLookAt);
    }

    // Screen glow
    if (this.screenGlowLight && this.video && !this.video.paused) {
      const time = this.video.currentTime;
      if (time < 4.0) this.screenGlowLight.color.setHex(0xc0392b);
      else if (time < 8.0) this.screenGlowLight.color.setHex(0xf39c12);
      else this.screenGlowLight.color.setHex(0xe74c3c);
    }

    this.renderer.render(this.scene, this.camera);
  }
}

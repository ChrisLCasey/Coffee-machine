// Procedural 3D model of a Franke A600 FoamMaster with SU05/SU12 cooling unit.
// Proportions follow Franke's published data (machine 340 x ~770 x 600 mm,
// SU05 270 x 540 x 475 mm, 2 bean hoppers + 1 powder hopper). Units are metres.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SCREEN_W, SCREEN_H } from './touchscreen.js';

const V3 = THREE.Vector3;
const Q = THREE.Quaternion;

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ---- layout constants -------------------------------------------------------
const MX = 0.10; // machine centre x
const MW = 0.34, MD = 0.60;
const CH = 0.30, CD = 0.30; // milk container height / depth
const HOLE = new V3(0.035, 0.005, -0.06); // suction hose hole in the lid (lid-local)
const CONT_OUT_POS = new V3(-0.55, 0, 0.55);
const CONT_OUT_QUAT = new Q().setFromEuler(new THREE.Euler(0, 0.35, 0));
const LID_OFF_POS = new V3(-0.33, 0.006, 0.60);
const LID_OFF_QUAT = new Q().setFromEuler(new THREE.Euler(0, 0.15, 0));
const HOSE_OFF_POS = new V3(-0.14, 0.014, 0.76);
const HOSE_OFF_QUAT = new Q().setFromEuler(new THREE.Euler(Math.PI / 2, 0.1, 0));

const VIEWS = {
  overview: { pos: [0.35, 0.82, 1.95], target: [-0.05, 0.34, 0.12] },
  screen: { pos: [0.10, 0.57, 0.78], target: [0.10, 0.53, 0.30] },
  cooling: { pos: [-0.45, 0.45, 1.20], target: [-0.25, 0.26, 0.10] },
  top: { pos: [0.28, 1.18, 0.90], target: [0.10, 0.70, -0.05] },
  sink: { pos: [0.85, 0.60, 1.20], target: [0.80, 0.04, 0.12] },
};

// ---- helpers ------------------------------------------------------------------
function labelTexture(str, w, h, fg, bg, font) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.fillStyle = fg; x.font = font;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(str, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function roundedBox(w, h, d, r, mat) {
  const x = -w / 2, y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -d / 2);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export class SceneApp {
  constructor(container, opts) {
    this.container = container;
    this.touchscreen = opts.touchscreen;
    this.onPart = opts.onPart || (() => {});
    this.unit = opts.coolingUnit === 'SU12' ? 'SU12' : 'SU05';
    this.parts = {};
    this.hoppers = {};
    this.tweens = [];
    this.time = 0;
    this.hoverId = null;
    this.pulseAmt = 0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe8dfd0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.02, 20);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.25;
    this.controls.maxDistance = 3.2;
    this.controls.maxPolarAngle = 1.5;
    this.controls.minAzimuthAngle = -1.3;
    this.controls.maxAzimuthAngle = 1.3;
    this.controls.screenSpacePanning = true;
    this.applyView('overview', true);

    this._buildLights();
    this._buildMaterials();
    this._buildEnvironment();
    this._buildMachine();
    this._buildCooling();
    this._buildSink();

    this.raycaster = new THREE.Raycaster();
    this._bindEvents();
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.clockObj = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  // ---- setup ----------------------------------------------------------------
  _buildLights() {
    const s = this.scene;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    s.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    s.environmentIntensity = 0.55;

    s.add(new THREE.HemisphereLight(0xffffff, 0x8a7a6a, 0.55));
    const key = new THREE.DirectionalLight(0xfff3e0, 2.2);
    key.position.set(1.0, 2.0, 1.6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -1.4;
    key.shadow.camera.right = 1.4;
    key.shadow.camera.top = 1.4;
    key.shadow.camera.bottom = -1.4;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 6;
    key.shadow.camera.updateProjectionMatrix();
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.015;
    s.add(key);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.6);
    fill.position.set(-1.5, 1.0, 1.2);
    s.add(fill);
  }

  _buildMaterials() {
    const std = (color, rough, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    const glass = (color, opacity, rough = 0.15) => new THREE.MeshPhysicalMaterial({
      color, roughness: rough, metalness: 0, transparent: true, opacity, depthWrite: false, clearcoat: 0.4,
    });
    this.M = {
      anthracite: std(0x2c2e33, 0.55, 0.25),
      black: std(0x151618, 0.45, 0.2),
      gloss: std(0x0a0b0c, 0.12, 0.4),
      steel: std(0xc2c6cc, 0.28, 1),
      darkSteel: std(0x4b4e54, 0.4, 0.9),
      rubber: std(0x2a2c2f, 0.9),
      liner: std(0xe6e9ec, 0.7),
      red: std(0xc8301f, 0.5),
      white: std(0xe9ecee, 0.5),
      counter: std(0xd8cfc0, 0.55),
      cabinet: std(0x3a3530, 0.8),
      wall: std(0xeee7da, 0.95),
      plastic: glass(0xb7c4d0, 0.34),
      lidPlastic: glass(0xe2e8ec, 0.72, 0.25),
      smoked: glass(0x5e4331, 0.42, 0.2),
      water: glass(0x9fd3ea, 0.5, 0.05),
      bean: std(0x4a2a17, 0.6),
      cocoa: std(0x6b4430, 0.95),
    };
  }

  _mk(geo, mat, x = 0, y = 0, z = 0, cast = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast && !mat.transparent;
    m.receiveShadow = true;
    return m;
  }
  _box(w, h, d, mat, x, y, z) {
    return this._mk(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  }
  _proxy(geo, x, y, z) {
    // invisible, but still clickable
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    m.position.set(x, y, z);
    m.userData.proxy = true;
    return m;
  }

  _buildEnvironment() {
    const M = this.M;
    this.scene.add(this._box(2.8, 0.05, 1.3, M.counter, 0, -0.025, 0.325));
    this.scene.add(this._box(2.8, 1.0, 1.28, M.cabinet, 0, -0.55, 0.325));
    const wall = this._box(3.4, 1.9, 0.04, M.wall, 0, 0.9, -0.34);
    wall.castShadow = false;
    this.scene.add(wall);
  }

  // Tag every un-tagged mesh under `root` as belonging to `id` and give it its own
  // material so hover highlighting never leaks onto neighbouring parts.
  registerPart(id, root) {
    const entry = this.parts[id] || (this.parts[id] = { root, meshes: [], nudging: false });
    root.traverse((o) => {
      if (!o.isMesh || o.userData.partId) return;
      o.userData.partId = id;
      if (o.userData.proxy) return;
      o.material = o.material.clone();
      if (o.material.emissive) {
        o.userData.baseEmissive = { color: o.material.emissive.clone(), intensity: o.material.emissiveIntensity };
      }
      entry.meshes.push(o);
    });
    return entry;
  }

  // ---- machine --------------------------------------------------------------
  _buildMachine() {
    const M = this.M;
    const g = new THREE.Group();
    g.position.set(MX, 0, 0);
    this.scene.add(g);
    this.machine = g;

    g.add(this._box(MW, 0.04, MD, M.anthracite, 0, 0.02, 0));
    g.add(this._box(MW, 0.29, 0.28, M.anthracite, 0, 0.185, -0.16)); // rear column
    const head = roundedBox(MW, 0.33, MD, 0.016, M.anthracite);
    head.position.set(0, 0.495, 0);
    g.add(head);

    // grounds drawer (decoy)
    const grounds = new THREE.Group();
    grounds.add(this._box(0.24, 0.07, 0.012, M.black, 0, 0.12, -0.014));
    const gh = this._mk(new THREE.CylinderGeometry(0.005, 0.005, 0.14, 12), M.steel, 0, 0.12, 0.0);
    gh.rotation.z = Math.PI / 2;
    grounds.add(gh);
    g.add(grounds);
    this.registerPart('grounds', grounds);

    // drip tray (decoy)
    const tray = new THREE.Group();
    tray.add(this._box(0.31, 0.02, 0.26, M.steel, 0, 0.05, 0.15));
    tray.add(this._box(0.29, 0.004, 0.24, M.darkSteel, 0, 0.062, 0.15));
    for (let i = 0; i < 9; i++) tray.add(this._box(0.29, 0.005, 0.006, M.steel, 0, 0.064, 0.05 + i * 0.026));
    tray.add(this._box(0.31, 0.03, 0.008, M.steel, 0, 0.055, 0.284));
    g.add(tray);
    this.registerPart('drip_tray', tray);

    // touchscreen
    const sg = new THREE.Group();
    sg.position.set(0, 0.535, 0.305);
    sg.rotation.x = -0.16;
    sg.add(this._box(0.25, 0.17, 0.008, M.steel, 0, 0, -0.002));
    const bezel = roundedBox(0.24, 0.16, 0.012, 0.01, M.gloss);
    bezel.position.z = 0.004;
    sg.add(bezel);
    this.screenTex = new THREE.CanvasTexture(this.touchscreen.canvas);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    this.screenTex.anisotropy = 8;
    const screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.21, 0.126),
      new THREE.MeshBasicMaterial({ map: this.screenTex, toneMapped: false }),
    );
    screenMesh.position.z = 0.0105;
    screenMesh.userData.partId = 'screen';
    sg.add(screenMesh);
    g.add(sg);

    // LED strip
    const led = this._box(0.18, 0.004, 0.004, new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xfff0d0, emissiveIntensity: 1.3,
    }), 0, 0.443, 0.302);
    led.castShadow = false;
    g.add(led);

    // combined outlet (decoy)
    const outlet = new THREE.Group();
    outlet.position.set(0, 0.33, 0.18);
    const ob = roundedBox(0.12, 0.04, 0.11, 0.01, M.black);
    ob.position.y = -0.02;
    outlet.add(ob);
    [[-0.018, 0.02], [0.018, 0.02], [0.05, 0.02]].forEach(([x, z]) => {
      outlet.add(this._mk(new THREE.CylinderGeometry(0.007, 0.007, 0.035, 14), M.steel, x, -0.057, z));
    });
    g.add(outlet);
    this.registerPart('outlet', outlet);

    // front service door (decoy)
    const door = new THREE.Group();
    door.position.set(0.112, 0.39, 0.30);
    door.add(this._box(0.07, 0.09, 0.008, M.gloss, 0, 0, 0.004));
    const knob = this._mk(new THREE.CylinderGeometry(0.01, 0.01, 0.008, 20), M.steel, 0, 0, 0.012);
    knob.rotation.x = Math.PI / 2;
    door.add(knob);
    g.add(door);
    this.registerPart('brew_door', door);

    // name plate
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.06, 0.016),
      new THREE.MeshBasicMaterial({ map: labelTexture('A600 FM', 240, 64, '#d9dbde', '#1b1c1e', '600 38px Helvetica, Arial, sans-serif') }),
    );
    plate.position.set(-0.105, 0.39, 0.3005);
    g.add(plate);

    // hoppers
    this._makeHopper('bean_l', 'hopper_bean_l', -0.085, -0.15, 0.15, 0.22, 0.098, 'beans');
    this._makeHopper('bean_r', 'hopper_bean_r', 0.085, -0.15, 0.15, 0.22, 0.098, 'beans');
    this._makeHopper('powder', 'hopper_powder', 0.0, 0.10, 0.17, 0.16, 0.07, 'powder');
  }

  _makeHopper(key, partId, x, z, w, d, h, kind) {
    const M = this.M;
    const grp = new THREE.Group();
    grp.position.set(x, 0.66, z);
    grp.add(this._box(w, h, d, M.smoked, 0, h / 2, 0));

    const contents = new THREE.Group();
    contents.position.y = 0.003;
    if (kind === 'beans') {
      const geo = new THREE.IcosahedronGeometry(0.0075, 0);
      const inst = new THREE.InstancedMesh(geo, M.bean, 260);
      const dummy = new THREE.Object3D();
      let seed = key === 'bean_l' ? 7 : 19;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let i = 0; i < 260; i++) {
        dummy.position.set((rnd() - 0.5) * (w - 0.02), 0.006 + Math.pow(rnd(), 1.6) * 0.055, (rnd() - 0.5) * (d - 0.02));
        dummy.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
        dummy.scale.set(1, 0.7, 1.4);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.raycast = () => {};
      contents.add(inst);
    } else {
      const base = this._box(w - 0.02, 0.035, d - 0.02, M.cocoa, 0, 0.0175, 0);
      const mound = this._box(w - 0.06, 0.02, d - 0.06, M.cocoa, 0, 0.042, 0);
      base.raycast = () => {};
      mound.raycast = () => {};
      contents.add(base, mound);
    }
    grp.add(contents);

    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, h, -d / 2 - 0.004);
    lidPivot.add(this._box(w + 0.006, 0.012, d + 0.008, M.black, 0, 0.006, d / 2 + 0.004));
    const lock = this._mk(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 16), M.steel, 0, 0.012, d + 0.0);
    lock.rotation.x = Math.PI / 2;
    lock.position.set(0, 0.006, d + 0.011);
    lidPivot.add(lock);
    grp.add(lidPivot);

    this.machine.add(grp);
    this.registerPart(partId, grp);
    this.hoppers[key] = { contents, lidPivot };
  }

  // ---- cooling unit ---------------------------------------------------------
  _buildCooling() {
    const M = this.M;
    const W = this.unit === 'SU12' ? 0.34 : 0.27;
    const H = 0.54, D = 0.475, t = 0.012;
    this.coolW = W;
    const cx = MX - MW / 2 - 0.02 - W / 2;
    const cz = -0.30 + D / 2;
    const cool = new THREE.Group();
    cool.position.set(cx, 0, cz);
    this.scene.add(cool);
    this.cool = cool;

    // shell
    cool.add(this._box(W, t, D, M.black, 0, t / 2, 0));
    cool.add(this._box(W, t, D, M.black, 0, H - t / 2, 0));
    cool.add(this._box(t, H, D, M.black, -W / 2 + t / 2, H / 2, 0));
    cool.add(this._box(t, H, D, M.black, W / 2 - t / 2, H / 2, 0));
    cool.add(this._box(W, H, t, M.black, 0, H / 2, -D / 2 + t / 2));
    // light interior liners
    const iw = W - 2 * t, ih = H - 2 * t;
    const liners = new THREE.Group();
    liners.add(this._box(iw, ih, 0.002, M.liner, 0, H / 2, -D / 2 + t + 0.001));
    liners.add(this._box(0.002, ih, D - t, M.liner, -W / 2 + t + 0.001, H / 2, t / 2));
    liners.add(this._box(0.002, ih, D - t, M.liner, W / 2 - t - 0.001, H / 2, t / 2));
    liners.add(this._box(iw, 0.002, D - t, M.liner, 0, t + 0.001, t / 2));
    liners.add(this._box(iw, 0.002, D - t, M.liner, 0, H - t - 0.001, t / 2));
    cool.add(liners);
    this.registerPart('chamber', liners); // not clickable-meaningful: treated as decoy

    this.fridgeLight = new THREE.PointLight(0xfff4e0, 0, 0.9, 1.5);
    this.fridgeLight.position.set(0, H - 0.08, 0.05);
    cool.add(this.fridgeLight);

    // door (hinged on the left edge)
    const pivot = new THREE.Group();
    pivot.position.set(-W / 2, H / 2, D / 2);
    const dw = W - 0.004, dh = H - 0.004;
    const doorBody = roundedBox(dw, dh, 0.028, 0.008, M.black);
    doorBody.position.set(dw / 2, 0, 0.014);
    pivot.add(doorBody);
    // lip seal (rubber frame on the inside of the door)
    const gx = dw / 2, gw = dw - 0.032, gh = dh - 0.032, gt = 0.012;
    pivot.add(this._box(gw, gt, 0.008, M.rubber, gx, gh / 2, -0.004));
    pivot.add(this._box(gw, gt, 0.008, M.rubber, gx, -gh / 2, -0.004));
    pivot.add(this._box(gt, gh, 0.008, M.rubber, gx - gw / 2, 0, -0.004));
    pivot.add(this._box(gt, gh, 0.008, M.rubber, gx + gw / 2, 0, -0.004));
    const handle = roundedBox(0.012, 0.22, 0.02, 0.004, M.steel);
    handle.position.set(dw - 0.03, 0, 0.038);
    pivot.add(handle);
    const unitPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.05, 0.014),
      new THREE.MeshBasicMaterial({ map: labelTexture(this.unit, 200, 56, '#d9dbde', '#1b1c1e', '600 34px Helvetica, Arial, sans-serif') }),
    );
    unitPlate.position.set(dw / 2, -H / 2 + 0.05, 0.0285);
    pivot.add(unitPlate);
    cool.add(pivot);
    this.doorPivot = pivot;
    this.registerPart('door', pivot);

    // milk container (lives in world space so it can travel to the counter)
    this.FRIDGE_POS = new V3(cx, t + 0.002, cz + 0.0475);
    const CW = 0.15;
    const cont = new THREE.Group();
    cont.position.copy(this.FRIDGE_POS);
    this.scene.add(cont);
    this.container = cont;
    const ct = 0.004;
    cont.add(this._box(CW, ct, CD, M.plastic, 0, ct / 2, 0));
    cont.add(this._box(CW, CH, ct, M.plastic, 0, CH / 2, CD / 2 - ct / 2));
    cont.add(this._box(CW, CH, ct, M.plastic, 0, CH / 2, -CD / 2 + ct / 2));
    cont.add(this._box(ct, CH, CD, M.plastic, -CW / 2 + ct / 2, CH / 2, 0));
    cont.add(this._box(ct, CH, CD, M.plastic, CW / 2 - ct / 2, CH / 2, 0));
    cont.add(this._box(0.09, 0.014, 0.022, M.black, 0, CH - 0.035, CD / 2 + 0.011));

    // lid
    const lid = new THREE.Group();
    lid.position.set(0, CH + 0.005, 0);
    lid.add(this._box(CW + 0.004, 0.010, CD + 0.004, M.lidPlastic, 0, 0, 0));
    lid.add(this._box(0.05, 0.012, 0.02, M.black, 0, 0.001, CD / 2 + 0.012));
    const ring = this._mk(new THREE.TorusGeometry(0.014, 0.005, 8, 18), M.black, HOLE.x, 0.006, HOLE.z);
    ring.rotation.x = Math.PI / 2;
    lid.add(ring);
    cont.add(lid);
    this.lid = lid;

    // suction hose + fitting (attached to the lid)
    const hose = new THREE.Group();
    hose.position.copy(HOLE);
    hose.add(this._mk(new THREE.CylinderGeometry(0.011, 0.011, 0.022, 16), M.black, 0, 0.011, 0));
    const elbowH = this._mk(new THREE.CylinderGeometry(0.007, 0.007, 0.024, 14), M.red, 0.011, 0.026, 0);
    elbowH.rotation.z = Math.PI / 2;
    hose.add(elbowH);
    hose.add(this._mk(new THREE.CylinderGeometry(0.007, 0.007, 0.018, 14), M.red, 0, 0.026, 0));
    const curve = new THREE.CatmullRomCurve3([
      new V3(0, 0.0, 0), new V3(0.004, -0.08, 0.004), new V3(-0.004, -0.17, 0.010), new V3(0, -0.27, 0.02),
    ]);
    hose.add(this._mk(new THREE.TubeGeometry(curve, 24, 0.0045, 8, false), M.white, 0, 0, 0));
    hose.add(this._mk(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 14), M.black, 0, -0.275, 0.02));
    hose.add(this._proxy(new THREE.CylinderGeometry(0.022, 0.022, 0.30, 10), 0, -0.12, 0.01));
    hose.add(this._proxy(new THREE.CylinderGeometry(0.024, 0.024, 0.06, 10), 0.004, 0.025, 0)); // easy target on top of the lid
    lid.add(hose);
    this.hose = hose;

    // register children first so the parent only claims what is left
    this.registerPart('hose', hose);
    this.registerPart('lid', lid);
    this.registerPart('container', cont);
  }

  // ---- sink -----------------------------------------------------------------
  _buildSink() {
    const M = this.M;
    const g = new THREE.Group();
    g.position.set(0.80, 0, 0.12);
    const W = 0.48, D = 0.38, Hh = 0.07, t = 0.014;
    g.add(this._box(W, 0.006, D, M.darkSteel, 0, 0.003, 0));
    g.add(this._box(W, Hh, t, M.steel, 0, Hh / 2, D / 2 - t / 2));
    g.add(this._box(W, Hh, t, M.steel, 0, Hh / 2, -D / 2 + t / 2));
    g.add(this._box(t, Hh, D, M.steel, -W / 2 + t / 2, Hh / 2, 0));
    g.add(this._box(t, Hh, D, M.steel, W / 2 - t / 2, Hh / 2, 0));
    const water = new THREE.Mesh(new THREE.PlaneGeometry(W - 2 * t, D - 2 * t), M.water);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.04;
    g.add(water);
    // tap
    g.add(this._mk(new THREE.CylinderGeometry(0.016, 0.018, 0.22, 16), M.steel, 0, 0.11, -D / 2 - 0.03));
    const spout = new THREE.CatmullRomCurve3([
      new V3(0, 0.22, -D / 2 - 0.03), new V3(0, 0.26, -D / 2 - 0.01), new V3(0, 0.25, -0.08), new V3(0, 0.205, -0.045),
    ]);
    g.add(this._mk(new THREE.TubeGeometry(spout, 20, 0.011, 10, false), M.steel, 0, 0, 0));
    g.add(this._box(0.05, 0.01, 0.012, M.steel, 0.03, 0.2, -D / 2 - 0.03));
    g.add(this._proxy(new THREE.BoxGeometry(W, 0.12, D + 0.08), 0, 0.06, 0));
    this.scene.add(g);
    this.registerPart('sink', g);
  }

  // ---- interaction ----------------------------------------------------------
  _bindEvents() {
    const dom = this.renderer.domElement;
    let down = null;
    dom.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    dom.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const dt = performance.now() - down.t;
      down = null;
      if (moved < 6 && dt < 600) this._click(e);
    });
    let pending = null;
    dom.addEventListener('pointermove', (e) => {
      if (e.buttons) return;
      pending = e;
      if (this._hoverQueued) return;
      this._hoverQueued = true;
      requestAnimationFrame(() => {
        this._hoverQueued = false;
        if (pending) this._hover(pending);
      });
    });
    dom.addEventListener('pointerleave', () => this.setHover(null));
  }

  _pick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    for (const h of hits) {
      if (h.object.userData.partId) return h;
      return null; // something un-clickable is in front
    }
    return null;
  }

  _click(e) {
    const hit = this._pick(e);
    if (!hit) return;
    const id = hit.object.userData.partId;
    if (id === 'screen') {
      if (hit.uv) this.touchscreen.pointer(hit.uv.x * SCREEN_W, (1 - hit.uv.y) * SCREEN_H);
      return;
    }
    this.onPart(id);
  }

  _hover(e) {
    const hit = this._pick(e);
    let id = hit ? hit.object.userData.partId : null;
    let pointer = !!id;
    if (id === 'screen') {
      pointer = !!(hit.uv && this.touchscreen.regionAt(hit.uv.x * SCREEN_W, (1 - hit.uv.y) * SCREEN_H));
      id = null;
    }
    this.setHover(id);
    this.renderer.domElement.style.cursor = pointer ? 'pointer' : 'grab';
  }

  setHover(id) {
    if (id === this.hoverId) return;
    const old = this.parts[this.hoverId];
    if (old) old.meshes.forEach((m) => { m.userData.hover = false; this._refreshEmissive(m); });
    this.hoverId = id;
    const cur = this.parts[id];
    if (cur) cur.meshes.forEach((m) => { m.userData.hover = true; this._refreshEmissive(m); });
  }

  _refreshEmissive(mesh) {
    const mat = mesh.material;
    const base = mesh.userData.baseEmissive;
    if (!mat || !mat.emissive || !base) return;
    if (mesh.userData.hover) {
      mat.emissive.setHex(0xff7a2a);
      mat.emissiveIntensity = 0.4;
    } else if (this.pulseAmt > 0 && mesh.userData.pulse) {
      mat.emissive.setHex(0xffffff);
      mat.emissiveIntensity = 0.55 * this.pulseAmt;
    } else {
      mat.emissive.copy(base.color);
      mat.emissiveIntensity = base.intensity;
    }
  }

  // ---- tweens ---------------------------------------------------------------
  tween(dur, fn, done, delay = 0) {
    this.tweens.push({ start: this.time + delay, dur, fn, done });
  }

  moveTo(obj, targetFn, dur, arc = 0, done = null) {
    const p0 = obj.position.clone();
    const q0 = obj.quaternion.clone();
    this.tween(dur, (e) => {
      const tg = targetFn();
      obj.position.lerpVectors(p0, tg.pos, e);
      obj.position.y += arc * Math.sin(Math.PI * e);
      obj.quaternion.slerpQuaternions(q0, tg.quat, e);
    }, done);
  }

  _step(dt) {
    this.time += dt;
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      if (this.time < tw.start) continue;
      const t = Math.min(1, (this.time - tw.start) / tw.dur);
      tw.fn(ease(t));
      if (t >= 1) {
        this.tweens.splice(i, 1);
        if (tw.done) tw.done();
      }
    }
  }

  // ---- effects triggered by the procedure -------------------------------------
  applyEffect(effect) {
    switch (effect) {
      case 'door_open': return this._setDoor(true);
      case 'door_close': return this._setDoor(false);
      case 'container_out': {
        // slide straight out of the cooling unit first so it clears the open door
        const lead = new V3(this.FRIDGE_POS.x, 0, 0.50);
        return this.moveTo(this.container, () => ({ pos: lead, quat: new Q() }), 0.55, 0.02, () => {
          this.moveTo(this.container, () => ({ pos: CONT_OUT_POS, quat: CONT_OUT_QUAT }), 0.6, 0.06);
        });
      }
      case 'container_in': {
        const lead = new V3(this.FRIDGE_POS.x, 0, 0.50);
        return this.moveTo(this.container, () => ({ pos: lead, quat: new Q() }), 0.6, 0.06, () => {
          this.moveTo(this.container, () => ({ pos: this.FRIDGE_POS, quat: new Q() }), 0.55, 0.02);
        });
      }
      case 'lid_off': {
        this.scene.attach(this.lid);
        return this.moveTo(this.lid, () => ({ pos: LID_OFF_POS, quat: LID_OFF_QUAT }), 0.7, 0.15);
      }
      case 'lid_on': {
        const target = () => {
          this.container.updateMatrixWorld(true);
          return {
            pos: this.container.localToWorld(new V3(0, CH + 0.005, 0)),
            quat: this.container.getWorldQuaternion(new Q()),
          };
        };
        if (this.lid.parent === this.container) return undefined;
        return this.moveTo(this.lid, target, 0.7, 0.15, () => {
          this.container.attach(this.lid);
          this.lid.position.set(0, CH + 0.005, 0);
          this.lid.quaternion.identity();
        });
      }
      case 'hose_off': {
        this.scene.attach(this.hose);
        return this.moveTo(this.hose, () => ({ pos: HOSE_OFF_POS, quat: HOSE_OFF_QUAT }), 0.7, 0.15);
      }
      case 'hose_on': {
        const target = () => {
          this.lid.updateMatrixWorld(true);
          return {
            pos: this.lid.localToWorld(HOLE.clone()),
            quat: this.lid.getWorldQuaternion(new Q()),
          };
        };
        return this.moveTo(this.hose, target, 0.7, 0.15, () => {
          this.lid.attach(this.hose);
          this.hose.position.copy(HOLE);
          this.hose.quaternion.identity();
        });
      }
      case 'empty_bean_l': return this._emptyHopper('bean_l');
      case 'empty_bean_r': return this._emptyHopper('bean_r');
      case 'empty_powder': return this._emptyHopper('powder');
      default: return undefined;
    }
  }

  _setDoor(open) {
    const from = this.doorPivot.rotation.y;
    const to = open ? -1.75 : 0;
    this.tween(0.8, (e) => {
      this.doorPivot.rotation.y = from + (to - from) * e;
      this.fridgeLight.intensity = open ? 8 * e : 8 * (1 - e);
    });
  }

  _emptyHopper(key) {
    const h = this.hoppers[key];
    if (!h) return;
    this.tween(0.35, (e) => { h.lidPivot.rotation.x = -1.25 * e; });
    this.tween(0.8, (e) => { h.contents.scale.y = Math.max(0.0001, 1 - e); }, () => { h.contents.visible = false; }, 0.3);
    this.tween(0.35, (e) => { h.lidPivot.rotation.x = -1.25 * (1 - e); }, null, 1.2);
  }

  nudge(id) {
    const p = this.parts[id];
    if (!p || p.nudging) return;
    p.nudging = true;
    const r = p.root;
    const x0 = r.position.x;
    this.tween(0.35, (e) => { r.position.x = x0 + Math.sin(e * Math.PI * 6) * (1 - e) * 0.006; }, () => {
      r.position.x = x0;
      p.nudging = false;
    });
  }

  // Sparkle on everything that was just washed.
  markClean() {
    ['container', 'lid', 'hose', 'hopper_bean_l', 'hopper_bean_r', 'hopper_powder', 'door'].forEach((id) => {
      const p = this.parts[id];
      if (p) p.meshes.forEach((m) => { m.userData.pulse = true; });
    });
    this.tween(1.4, (e) => {
      this.pulseAmt = Math.sin(Math.PI * e);
      Object.values(this.parts).forEach((p) => p.meshes.forEach((m) => { if (m.userData.pulse) this._refreshEmissive(m); }));
    }, () => {
      this.pulseAmt = 0;
      Object.values(this.parts).forEach((p) => p.meshes.forEach((m) => { m.userData.pulse = false; this._refreshEmissive(m); }));
    });
  }

  resetState() {
    this.tweens.length = 0;
    this.setHover(null);
    this.pulseAmt = 0;
    this.doorPivot.rotation.y = 0;
    this.fridgeLight.intensity = 0;
    this.container.position.copy(this.FRIDGE_POS);
    this.container.quaternion.identity();
    this.container.add(this.lid);
    this.lid.position.set(0, CH + 0.005, 0);
    this.lid.quaternion.identity();
    this.lid.add(this.hose);
    this.hose.position.copy(HOLE);
    this.hose.quaternion.identity();
    Object.values(this.hoppers).forEach((h) => {
      h.contents.visible = true;
      h.contents.scale.y = 1;
      h.lidPivot.rotation.x = 0;
    });
    Object.values(this.parts).forEach((p) => { p.nudging = false; p.meshes.forEach((m) => { m.userData.pulse = false; this._refreshEmissive(m); }); });
    this.applyView('overview', false);
  }

  // ---- camera ---------------------------------------------------------------
  applyView(name, instant) {
    const v = VIEWS[name] || VIEWS.overview;
    const toPos = new V3(...v.pos);
    const toTarget = new V3(...v.target);
    if (instant) {
      this.camera.position.copy(toPos);
      this.controls.target.copy(toTarget);
      this.controls.update();
      return;
    }
    const p0 = this.camera.position.clone();
    const t0 = this.controls.target.clone();
    this.tween(0.9, (e) => {
      this.camera.position.lerpVectors(p0, toPos, e);
      this.controls.target.lerpVectors(t0, toTarget, e);
    });
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _frame() {
    const dt = Math.min(0.05, this.clockObj.getDelta());
    this._step(dt);
    if (this.touchscreen.update(dt)) this.screenTex.needsUpdate = true;
    const tg = this.controls.target;
    tg.x = Math.max(-1.1, Math.min(1.3, tg.x));
    tg.y = Math.max(0.0, Math.min(1.0, tg.y));
    tg.z = Math.max(-0.2, Math.min(0.9, tg.z));
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

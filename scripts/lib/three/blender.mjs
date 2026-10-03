// `cstack 3d blender-script`: writes a self-contained bpy script for a headless turntable or packshot render
// (`blender -b -P script.py`). The text is a pure function of the parameters; cstack never runs Blender.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const VERSION = createRequire(import.meta.url)('../../../package.json').version;
export const MODES = ['turntable', 'packshot'];

export const BLENDER_USAGE = 'usage: cstack 3d blender-script --glb <file> --mode turntable|packshot [--frames 120] [--seconds 6] [--size 1080x1920] [--hdri path] [--camera-height 0.3] [--render-dir dir] [--out script.py]';

// Per-mode render defaults, stated in the script header so the owner can edit them.
const MODE_DEFAULTS = {
  turntable: { lens: 85, samples: 64 },
  packshot: { lens: 100, samples: 256 },
};
// Camera orbit angles (degrees, counter-clockwise seen from above; 0 = the glTF front, +Z).
// front/side/back give the 4 canonical angles for the label overlay check; the 3/4 views are the usual heroes.
const PACKSHOT_ANGLES = [['front', 0], ['threequarter', 45], ['side', 90], ['back', 180], ['side', 270], ['threequarter', 315]];
// name, azimuth (0 = camera side, + = camera right), elevation, distance, size x, size y, watts; model normalized to 1 unit.
const STUDIO_LIGHTS = [['cstack_key', -45, 35, 2.5, 1.5, 1.5, 100], ['cstack_fill', 50, 15, 3, 2, 2, 33], ['cstack_rim', 160, 40, 2.5, 0.4, 2, 80]];

const q = (s) => JSON.stringify(String(s)); // a valid Python str literal and a one-line comment value
const pyNum = (x) => (Number.isInteger(x) ? `${x}.0` : String(x));
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/** Frame rate as ffmpeg accepts it: "20", "120/7" or a decimal. */
export function frameRate(frames, seconds) {
  const fps = frames / seconds;
  if (Number.isInteger(fps)) return String(fps);
  if (Number.isInteger(seconds)) {
    const g = gcd(frames, seconds);
    return `${frames / g}/${seconds / g}`;
  }
  return String(Math.round(fps * 1e6) / 1e6);
}

export function parseSize(v) {
  const m = String(v).trim().match(/^(\d+)\s*[xX]\s*(\d+)$/);
  const w = m && Number(m[1]);
  const h = m && Number(m[2]);
  if (!m || w < 16 || h < 16 || w > 16384 || h > 16384) throw new Error(`invalid --size "${v}" (WxH in pixels, 16..16384, e.g. 1080x1920)`);
  return { width: w, height: h };
}

function number(v, def, min, max, flag, integer = false) {
  if (v === undefined) return def;
  const n = Number(v);
  if (v === true || v === '' || !Number.isFinite(n) || (integer && !Number.isInteger(n)) || n < min || n > max) throw new Error(`invalid ${flag} "${v}" (${integer ? 'an integer' : 'a number'} from ${min} to ${max})`);
  return n;
}

function existing(v, ws, flag) {
  if (v === undefined || v === true || v === '') throw new Error(`${flag} needs a path\n${BLENDER_USAGE}`);
  for (const p of [path.resolve(String(v)), path.resolve(ws, String(v))]) if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  throw new Error(`${flag}: file not found: ${v}`);
}

/** Validate CLI flags into absolute, explicit parameters. */
export function blenderParams(a, ws = process.cwd()) {
  const glb = existing(a.glb, ws, '--glb');
  if (!/\.(glb|gltf)$/i.test(glb)) throw new Error(`--glb must be a .glb or .gltf file: ${a.glb}`);
  if (!MODES.includes(a.mode)) throw new Error(`--mode must be ${MODES.join(' or ')}\n${BLENDER_USAGE}`);
  const { width, height } = parseSize(a.size ?? '1080x1920');
  if (a.out === true || a.out === '') throw new Error('--out needs a path');
  const out = a.out === undefined ? null : path.resolve(String(a.out));
  const stem = path.basename(glb).replace(/\.(glb|gltf)$/i, '').replace(/[^\w.-]+/g, '_') || 'model';
  const renderDir = a['render-dir'] !== undefined && a['render-dir'] !== true ? path.resolve(String(a['render-dir'])) : out ? path.join(path.dirname(out), a.mode) : path.join(path.resolve(ws), 'work', '3d', stem, a.mode);
  return {
    glb,
    mode: a.mode,
    frames: number(a.frames, 120, 1, 3600, '--frames', true),
    seconds: number(a.seconds, 6, 0.1, 600, '--seconds'),
    width,
    height,
    hdri: a.hdri === undefined ? null : existing(a.hdri, ws, '--hdri'),
    camera_height: number(a['camera-height'], 0.3, -0.5, 5, '--camera-height'),
    render_dir: renderDir,
    out,
  };
}

export const runCommand = (p, extra = '') => `blender -b -P ${q(p.out ?? 'script.py')}${extra}`;

/** The bpy script text. Same parameters, same bytes. */
export function blenderScript(p) {
  const d = MODE_DEFAULTS[p.mode];
  const turntable = p.mode === 'turntable';
  const fps = frameRate(p.frames, p.seconds);
  const step = Math.round((360 / p.frames) * 1000) / 1000;
  const cli = ['cstack 3d blender-script', `--glb ${q(p.glb)}`, `--mode ${p.mode}`, ...(turntable ? [`--frames ${p.frames}`, `--seconds ${p.seconds}`] : []), `--size ${p.width}x${p.height}`, ...(p.hdri ? [`--hdri ${q(p.hdri)}`] : []), `--camera-height ${p.camera_height}`, `--render-dir ${q(p.render_dir)}`, ...(p.out ? [`--out ${q(p.out)}`] : [])].join(' ');
  const video = `${p.render_dir}.mp4`;
  const header = [
    `# cstack 3d blender-script (cstack ${VERSION}): headless ${p.mode} render. Deterministic from the parameters below.`,
    '# cstack never runs Blender. Run it yourself (it reads only the files named here and writes PNGs to render_dir):',
    `#   ${runCommand(p)}`,
    `#   ${runCommand(p, ' -- --preview')}   first ${turntable ? 'frame' : 'still'} only, 16 samples, half size, into render_dir/preview`,
    `#   add -- --cpu to skip GPU detection`,
    '#',
    '# Parameters',
    `#   glb            ${q(p.glb)}`,
    `#   mode           ${p.mode}`,
    turntable ? `#   frames         ${p.frames} over ${p.seconds} s = ${fps} fps, ${step} deg per frame, seamless loop (frame ${p.frames + 1} would repeat frame 1)` : `#   stills         ${PACKSHOT_ANGLES.map(([n, a]) => `${n} ${a}`).join(', ')} (camera orbit degrees; frames/seconds do not apply)`,
    `#   size           ${p.width}x${p.height}`,
    `#   lighting       ${p.hdri ? `HDRI ${q(p.hdri)}, turning with the camera` : 'neutral studio: key/fill/rim area lights at 3:1 key:fill, turning with the camera, dark grey world'}`,
    `#   camera_height  ${p.camera_height} (camera height above the model's vertical centre, as a fraction of the model height)`,
    `#   lens           ${d.lens} mm on a 36 mm sensor; the camera orbits counter-clockwise seen from above, 0 deg = glTF front (+Z)`,
    `#   render_dir     ${q(p.render_dir)}`,
    `#   output         RGBA PNG, transparent film + shadow-catcher floor, Cycles ${d.samples} samples, Standard view transform`,
    `#   command        ${cli}`,
    '#',
    '# Normalization: the model is scaled so its largest side is 1 unit and its base centre sits at the origin;',
    '# the original size is printed. Imported lights and cameras are removed. Edit the constants below to tune.',
    '#',
    '# WARNING (label truth): official label artwork must be applied as the texture, UV-mapped from the brand\'s',
    '# official files. Never generate, repaint or approximate a label, logo or print with a model. This script renders',
    '# the materials exactly as imported and never edits them; check the label on every rendered angle.',
    '#',
    ...(turntable
      ? [
          '# Afterwards (examples; replace 0xEEEEEE with the brand backdrop token):',
          `#   video:  ffmpeg -framerate ${fps} -i ${q(path.join(p.render_dir, 'frame_%04d.png'))} -f lavfi -i "color=c=0xEEEEEE:s=${p.width}x${p.height}:r=${fps}" -filter_complex "[1:v][0:v]overlay=shortest=1,format=yuv420p" -c:v libx264 -crf 18 -movflags +faststart ${q(video)}`,
          `#   web:    mkdir -p ${q(path.join(p.render_dir, 'web'))} && ffmpeg -i ${q(path.join(p.render_dir, 'frame_%04d.png'))} -c:v libwebp -quality 85 -f image2 ${q(path.join(p.render_dir, 'web', 'frame_%04d.webp'))}`,
          `#   check:  cstack 3d frames ${q(path.join(p.render_dir, 'web'))}`,
        ]
      : ['# Afterwards: composite the stills over the brand backdrop and run the 4-angle label overlay against the official artwork.']),
  ];
  const constants = [
    `GLB = ${q(p.glb)}`,
    `MODE = ${q(p.mode)}`,
    `FRAMES = ${p.frames}`,
    `SECONDS = ${pyNum(p.seconds)}`,
    `WIDTH, HEIGHT = ${p.width}, ${p.height}`,
    `HDRI = ${p.hdri ? q(p.hdri) : 'None'}`,
    'HDRI_STRENGTH = 1.0',
    `CAMERA_HEIGHT = ${pyNum(p.camera_height)}`,
    `LENS_MM = ${pyNum(d.lens)}`,
    'SENSOR_MM = 36.0',
    'MARGIN = 1.12  # frame fill: 1.12 leaves about 6% air on the tightest side',
    `RENDER_DIR = ${q(p.render_dir)}`,
    `SAMPLES = ${d.samples}`,
    'PREVIEW_SAMPLES = 16',
    'EXPOSURE = 0.0  # stops; tune after a --preview render',
    'NORMALIZED_SIZE = 1.0',
    'WORLD_GREY = 0.05',
    'STUDIO_LIGHTS = [',
    '    # name, azimuth deg (0 = camera side, + = camera right), elevation deg, distance, size x, size y, watts',
    ...STUDIO_LIGHTS.map((l) => `    (${q(l[0])}, ${l.slice(1).map(pyNum).join(', ')}),`),
    ']',
    `PACKSHOT_ANGLES = [${PACKSHOT_ANGLES.map(([n, a]) => `(${q(n)}, ${pyNum(a)})`).join(', ')}]`,
  ];
  return [...header, '', ...BODY_IMPORTS, '', ...constants, BODY].join('\n');
}

const BODY_IMPORTS = ['import math', 'import os', 'import sys', 'import time', '', 'import bpy', 'from mathutils import Vector'];

const BODY = String.raw`
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
PREVIEW = "--preview" in ARGS
FORCE_CPU = "--cpu" in ARGS


def log(msg):
    print("[cstack] " + msg, flush=True)


def fail(msg):
    print("[cstack] ERROR: " + msg, file=sys.stderr, flush=True)
    sys.exit(1)


def clear_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)


def import_model():
    if not os.path.isfile(GLB):
        fail("model not found: " + GLB)
    before = set(bpy.data.objects)
    try:
        bpy.ops.import_scene.gltf(filepath=GLB)
    except Exception as exc:
        fail("glTF import failed: %s" % exc)
    new = [o for o in bpy.data.objects if o not in before]
    dropped = [o for o in new if o.type in ("LIGHT", "CAMERA")]
    for o in dropped:
        new.remove(o)
        bpy.data.objects.remove(o, do_unlink=True)
    meshes = [o for o in new if o.type == "MESH"]
    if not meshes:
        fail("no mesh objects in " + GLB)
    return new, meshes, len(dropped)


def world_bounds(objs):
    bpy.context.view_layer.update()
    lo = [math.inf] * 3
    hi = [-math.inf] * 3
    for o in objs:
        for corner in o.bound_box:
            p = o.matrix_world @ Vector(corner)
            for k in range(3):
                lo[k] = min(lo[k], p[k])
                hi[k] = max(hi[k], p[k])
    return Vector(lo), Vector(hi)


def normalize(new, meshes):
    """Scale so the largest side is NORMALIZED_SIZE and move the base centre to the origin."""
    lo, hi = world_bounds(meshes)
    size = hi - lo
    if max(size) <= 0.0:
        fail("the model has zero size")
    root = bpy.data.objects.new("cstack_root", None)
    bpy.context.scene.collection.objects.link(root)
    for o in new:
        if o.parent is None:
            o.parent = root
    scale = NORMALIZED_SIZE / max(size)
    base = Vector(((lo.x + hi.x) / 2.0, (lo.y + hi.y) / 2.0, lo.z))
    root.scale = (scale, scale, scale)
    root.location = -base * scale
    bpy.context.view_layer.update()
    return size, scale


def half_fov():
    half = math.atan(SENSOR_MM / (2.0 * LENS_MM))  # sensor fit AUTO: the sensor width spans the longer image side
    if WIDTH >= HEIGHT:
        return half, math.atan(math.tan(half) * HEIGHT / WIDTH)
    return math.atan(math.tan(half) * WIDTH / HEIGHT), half


def fits(dist, cam_z, target, points, tx, ty):
    cam = Vector((0.0, -dist, cam_z))
    fwd = (target - cam).normalized()
    right = fwd.cross(Vector((0.0, 0.0, 1.0))).normalized()
    up = right.cross(fwd)
    for p in points:
        v = p - cam
        depth = v.dot(fwd)
        if depth <= 0.0 or abs(v.dot(right)) > tx * depth or abs(v.dot(up)) > ty * depth:
            return False
    return True


def add_camera(scene, height, radius):
    """Camera on an orbit rig, framed so the model swept through 360 deg fits with MARGIN."""
    hx, hy = half_fov()
    tx, ty = math.tan(hx) / MARGIN, math.tan(hy) / MARGIN
    target = Vector((0.0, 0.0, height / 2.0))
    cam_z = height / 2.0 + CAMERA_HEIGHT * height
    ring = [2.0 * math.pi * k / 32 for k in range(32)]
    points = [Vector((radius * math.cos(a), radius * math.sin(a), z)) for z in (0.0, height) for a in ring]
    lo, hi = radius * 1.01 + 0.01, 1000.0
    if not fits(hi, cam_z, target, points, tx, ty):
        fail("cannot frame the model from this camera height")
    for _ in range(60):
        mid = (lo + hi) / 2.0
        if fits(mid, cam_z, target, points, tx, ty):
            hi = mid
        else:
            lo = mid
    rig = bpy.data.objects.new("cstack_orbit", None)
    scene.collection.objects.link(rig)
    data = bpy.data.cameras.new("cstack_camera")
    data.lens = LENS_MM
    data.sensor_width = SENSOR_MM
    data.sensor_fit = "AUTO"
    data.clip_start = 0.01
    data.clip_end = hi * 10.0 + 10.0
    cam = bpy.data.objects.new("cstack_camera", data)
    scene.collection.objects.link(cam)
    cam.parent = rig
    cam.location = (0.0, -hi, cam_z)
    cam.rotation_euler = (target - Vector((0.0, -hi, cam_z))).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    return rig, hi, cam_z, math.degrees(math.atan2(cam_z - target.z, hi))


def add_area(rig, target, name, azimuth, elevation, distance, size_x, size_y, watts):
    data = bpy.data.lights.new(name, type="AREA")
    data.energy = watts
    data.shape = "RECTANGLE"
    data.size = size_x
    data.size_y = size_y
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = rig
    a, e = math.radians(azimuth), math.radians(elevation)
    loc = target + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * distance
    obj.location = loc
    obj.rotation_euler = (target - loc).to_track_quat("-Z", "Y").to_euler()


def setup_world(scene):
    world = bpy.data.worlds.new("cstack_world")
    scene.world = world
    if hasattr(world, "use_nodes"):
        world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputWorld")
    bg = nodes.new("ShaderNodeBackground")
    links.new(bg.outputs["Background"], out.inputs["Surface"])
    if not HDRI:
        bg.inputs["Color"].default_value = (WORLD_GREY, WORLD_GREY, WORLD_GREY, 1.0)
        bg.inputs["Strength"].default_value = 1.0
        return None
    if not os.path.isfile(HDRI):
        fail("HDRI not found: " + HDRI)
    env = nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(HDRI)
    coords = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    links.new(coords.outputs["Generated"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], env.inputs["Vector"])
    links.new(env.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = HDRI_STRENGTH
    return mapping


def add_floor(scene):
    mesh = bpy.data.meshes.new("cstack_floor")
    s, z = 50.0, -0.0005 * NORMALIZED_SIZE
    mesh.from_pydata([(-s, -s, z), (s, -s, z), (s, s, z), (-s, s, z)], [], [(0, 1, 2, 3)])
    floor = bpy.data.objects.new("cstack_floor", mesh)
    scene.collection.objects.link(floor)
    if hasattr(floor, "is_shadow_catcher"):
        floor.is_shadow_catcher = True
    else:
        floor.cycles.is_shadow_catcher = True


def pick_device(scene):
    scene.cycles.device = "CPU"
    if FORCE_CPU:
        return "CPU"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for kind in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
            try:
                prefs.compute_device_type = kind
            except TypeError:
                continue
            prefs.get_devices()
            if any(d.type == kind for d in prefs.devices):
                for d in prefs.devices:
                    d.use = d.type == kind
                scene.cycles.device = "GPU"
                return kind
    except Exception as exc:
        log("GPU detection failed (%s); rendering on CPU" % exc)
    return "CPU"


def setup_render(scene):
    scene.render.engine = "CYCLES"
    scene.cycles.samples = PREVIEW_SAMPLES if PREVIEW else SAMPLES
    scene.cycles.use_denoising = True
    scene.cycles.seed = 0
    scene.cycles.use_animated_seed = False
    scene.render.resolution_x = WIDTH
    scene.render.resolution_y = HEIGHT
    scene.render.resolution_percentage = 50 if PREVIEW else 100
    scene.render.film_transparent = True
    scene.render.use_persistent_data = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = EXPOSURE
    return pick_device(scene)


def shots():
    if MODE == "turntable":
        return [("frame_%04d" % (i + 1), 360.0 * i / FRAMES) for i in range(FRAMES)]
    return [("%02d_%s_%03d" % (i + 1, name, round(deg)), deg) for i, (name, deg) in enumerate(PACKSHOT_ANGLES)]


def main():
    started = time.time()
    scene = bpy.context.scene
    log("Blender %s; mode %s%s" % (bpy.app.version_string, MODE, " (preview)" if PREVIEW else ""))
    log("label truth: official label artwork must be the texture; this script never edits materials or textures")
    clear_scene()
    new, meshes, dropped = import_model()
    size, scale = normalize(new, meshes)
    log("imported %d objects (%d meshes) from %s%s" % (len(new), len(meshes), GLB, "; removed %d imported lights/cameras" % dropped if dropped else ""))
    log("model size %.4f x %.4f x %.4f (Blender X x Y x Z; metres when the GLB follows glTF units)" % tuple(size))
    log("normalized: scale x%.6g so the largest side is %.2f; base centre moved to the origin" % (scale, NORMALIZED_SIZE))
    height = size.z * scale
    radius = math.hypot(size.x, size.y) * scale / 2.0
    device = setup_render(scene)
    mapping = setup_world(scene)
    rig, dist, cam_z, tilt = add_camera(scene, height, radius)
    target = Vector((0.0, 0.0, height / 2.0))
    if HDRI:
        log("lighting: HDRI %s (strength %.2f), turning with the camera" % (HDRI, HDRI_STRENGTH))
    else:
        for name, azimuth, elevation, distance, size_x, size_y, watts in STUDIO_LIGHTS:
            add_area(rig, target, name, azimuth, elevation, distance, size_x, size_y, watts)
        log("lighting: neutral studio, %d area lights turning with the camera, world grey %.2f" % (len(STUDIO_LIGHTS), WORLD_GREY))
    add_floor(scene)
    log("camera: %.0f mm, %.3f from the axis, height %.3f (model height %.3f), tilt %.1f deg (positive looks down)" % (LENS_MM, dist, cam_z, height, tilt))
    log("render: Cycles on %s, %d samples, %dx%d at %d%%, RGBA PNG, transparent film, shadow catcher, Standard view, exposure %+.2f" % (device, scene.cycles.samples, WIDTH, HEIGHT, scene.render.resolution_percentage, EXPOSURE))
    if MODE == "turntable":
        log("turntable: %d frames over %.4g s (%.4g fps), %.3f deg per frame, seamless loop" % (FRAMES, SECONDS, FRAMES / SECONDS, 360.0 / FRAMES))
    out_dir = os.path.join(RENDER_DIR, "preview") if PREVIEW else RENDER_DIR
    os.makedirs(out_dir, exist_ok=True)
    todo = shots()[:1] if PREVIEW else shots()
    for i, (name, deg) in enumerate(todo):
        angle = math.radians(deg)
        rig.rotation_euler = (0.0, 0.0, angle)
        if mapping is not None:
            mapping.inputs["Rotation"].default_value[2] = -angle
        path = os.path.join(out_dir, name + ".png")
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        log("%d/%d  %5.1f deg  %s" % (i + 1, len(todo), deg, path))
    log("done: %d %s in %s (%.0f s)" % (len(todo), "frame(s)" if MODE == "turntable" else "still(s)", out_dir, time.time() - started))


main()
`;

# Minimal stand-in for Blender's bpy so tests can run the control flow of cstack's generated scripts
# (names, loops, framing math, file naming). It accepts any settings attribute, so it proves nothing about
# the real Blender API; a real `blender -b -P` run stays an owner step.
import json
import os

from mathutils import Matrix

CALLS = []


class Any:
    def __init__(self, **kw):
        self.__dict__.update(kw)

    def __getattr__(self, k):
        v = Any()
        setattr(self, k, v)
        return v


class Socket:
    def __init__(self):
        self.default_value = [0.0, 0.0, 0.0, 1.0]


class Node:
    def __init__(self, kind):
        self.kind = kind
        self.image = None
        self.inputs = {k: Socket() for k in ("Color", "Strength", "Vector", "Rotation", "Surface")}
        self.outputs = {k: Socket() for k in ("Background", "Color", "Vector", "Generated")}


class Nodes(list):
    def new(self, kind):
        n = Node(kind)
        self.append(n)
        return n


class Obj:
    def __init__(self, name, data=None, kind="EMPTY", size=(1.0, 1.0, 1.0), offset=(0.0, 0.0, 0.0)):
        self.name, self.data, self.type, self.parent = name, data, kind, None
        self.bound_box = [tuple(offset[k] + (size[k] if c >> k & 1 else 0.0) for k in range(3)) for c in range(8)]
        self.matrix_world = Matrix()
        self.location = self.rotation_euler = (0.0, 0.0, 0.0)
        self.scale = (1.0, 1.0, 1.0)
        self.cycles = Any()


class Objects(list):
    def new(self, name, data):
        o = Obj(name, data, "EMPTY" if data is None else data.kind)
        self.append(o)
        return o

    def remove(self, o, do_unlink=True):
        list.remove(self, o)


class Datablocks:
    def __init__(self, kind):
        self.kind = kind

    def new(self, name, type=None):
        d = Any(name=name, kind=self.kind)
        if self.kind == "WORLD":
            d.use_nodes = False
            d.node_tree = Any(nodes=Nodes(), links=Any(new=lambda a, b: None))
        if self.kind == "MESH":
            d.from_pydata = lambda verts, edges, faces: None
        return d


class Images:
    def load(self, filepath):
        if not os.path.isfile(filepath):
            raise RuntimeError("cannot read " + filepath)
        return Any(filepath=filepath)


# what the fake glTF import creates: size/offset in Blender units, plus a light and a camera to be removed
MODEL = json.loads(os.environ.get("CSTACK_BPY_STUB_MODEL", '{"size": [0.2, 0.3, 0.6], "offset": [-0.1, -0.15, 0.4]}'))

data = Any(objects=Objects(), cameras=Datablocks("CAMERA"), lights=Datablocks("LIGHT"), worlds=Datablocks("WORLD"), meshes=Datablocks("MESH"), images=Images())
data.objects.append(Obj("Cube", Any(kind="MESH"), "MESH"))
scene = Any(collection=Any(objects=Any(link=lambda o: None)), render=Any(image_settings=Any()))
context = Any(scene=scene, view_layer=Any(update=lambda: None), preferences=Any(addons={"cycles": Any(preferences=Any(devices=[], get_devices=lambda: None))}))
app = Any(version_string="stub")


def _import_gltf(filepath):
    if not os.path.isfile(filepath):
        raise RuntimeError("file not found")
    CALLS.append(("import", filepath))
    data.objects.append(Obj("Model", Any(kind="MESH"), "MESH", MODEL["size"], MODEL["offset"]))
    data.objects.append(Obj("ImportedLight", Any(kind="LIGHT"), "LIGHT"))
    data.objects.append(Obj("ImportedCamera", Any(kind="CAMERA"), "CAMERA"))


def _render(write_still=False):
    path = scene.render.filepath
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(b"stub render\n")


ops = Any(import_scene=Any(gltf=_import_gltf), render=Any(render=_render))

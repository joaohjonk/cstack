# Minimal stand-in for Blender's mathutils, only what cstack's generated scripts use. Not Blender.
import math


class Euler(tuple):
    pass


class Quaternion:
    def __init__(self, direction):
        self.direction = direction

    def to_euler(self):
        x, y, z = self.direction
        return Euler((math.atan2(math.hypot(x, y), -z), 0.0, math.atan2(x, -y)))


class Vector:
    def __init__(self, seq):
        self.v = [float(x) for x in seq]
        if len(self.v) != 3:
            raise ValueError("stub Vector is 3D only")

    x = property(lambda self: self.v[0])
    y = property(lambda self: self.v[1])
    z = property(lambda self: self.v[2])

    def __iter__(self):
        return iter(self.v)

    def __getitem__(self, i):
        return self.v[i]

    def __len__(self):
        return 3

    def __add__(self, o):
        return Vector(a + b for a, b in zip(self, o))

    def __sub__(self, o):
        return Vector(a - b for a, b in zip(self, o))

    def __neg__(self):
        return Vector(-a for a in self)

    def __mul__(self, k):
        return Vector(a * k for a in self)

    __rmul__ = __mul__

    def dot(self, o):
        return sum(a * b for a, b in zip(self, o))

    def cross(self, o):
        a, b = self.v, list(o)
        return Vector((a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]))

    def normalized(self):
        n = math.sqrt(self.dot(self))
        return Vector(a / n for a in self) if n else Vector((0.0, 0.0, 0.0))

    def to_track_quat(self, track, up):
        if (track, up) != ("-Z", "Y"):
            raise ValueError("stub supports camera/light tracking only")
        return Quaternion(self.v)


class Matrix:
    def __matmul__(self, v):
        return Vector(v)

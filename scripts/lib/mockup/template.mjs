// Mockup template packages: a directory holding template.json and the images it names (paths relative to the directory,
// never outside it). Loading validates against TEMPLATE_SCHEMA, builds each placement's mapper and hashes everything that
// affects pixels. Format reference with a working example: tests/fixtures/mockup/poster-wall/README.md.
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { formatErrors } from '../schemas.mjs';
import { sha256File, hashValue } from '../core.mjs';
import { imageSize } from '../image.mjs';
import { makeMapper } from './geometry.mjs';

/**
 * @typedef {object} MockupTemplate  template.json
 * @property {string} [id]                    name used in reports (default: the directory name)
 * @property {string} base                    scene image; every map below has the base's exact size
 * @property {MockupPlacement[]} placements   composited in order
 * @property {MockupLicence} licence          a gate: false blocks renders, 'unknown' warns unless --internal
 * @property {string} [notes]
 * @property {object} [meta]                  free-form, ignored by the engine
 *
 * @typedef {object} MockupLicence
 * @property {string} source                  where the template (photo, layers) came from
 * @property {string} terms                   licence name or a summary of the terms
 * @property {true|false|'unknown'} client_use_allowed
 *
 * @typedef {object} MockupPlacement
 * @property {string} id
 * @property {'quad'|'cylinder'|'mesh'} kind
 * @property {number[][]} [quad]              kind quad: base px of the art corners TL, TR, BR, BL (convex, not mirrored)
 * @property {MockupCylinder} [cylinder]      kind cylinder
 * @property {number[][][]} [mesh]            kind mesh: rows (top to bottom) of [x, y] points (left to right), ≥ 2×2; each
 *                                            cell is a bilinear patch and must be convex
 * @property {{x:number,y:number,w:number,h:number}} [region]  integer base px this placement may change (a clip; only the
 *                                            geometry's bounding box plus edge, feather and displacement margins is touched,
 *                                            and the sidecar records that effective region); pixels outside stay byte-identical
 * @property {{x:number,y:number,w:number,h:number}} [art_region]  part of the art for this placement, fractions 0..1
 *                                            (default the whole art); one dieline art can feed one quad per carton panel
 * @property {number} [aspect]                physical width/height of the print area; when set, `fit` keeps proportions
 * @property {'contain'|'cover'|'stretch'} [fit]  default contain (only used with aspect)
 * @property {number} [feather]               extra edge softness in px on top of the 1 px antialiased edge (default 0)
 * @property {string} [mask]                  PNG: where the art may show (alpha when the PNG has transparency, else luminance)
 * @property {MockupDisplacement} [displacement]
 * @property {MockupShading[]} [shading]      applied to the art in order, before it is laid over the base
 *
 * @typedef {object} MockupCylinder           vertical axis, orthographic: θ = asin((x − axis_x)/radius), arc u = radius·θ
 * @property {number} axis_x                  base px of the axis
 * @property {number} top                     base y of the art's top edge where it faces the camera (θ = 0)
 * @property {number} bottom                  base y of the art's bottom edge at θ = 0
 * @property {number} radius                  half the cylinder's visible width, px
 * @property {number} [visible_arc]           degrees of the face that can show art, ≤ 180 (default 180)
 * @property {number} [art_arc]               degrees of circumference the art's width covers, ≤ 360 (default visible_arc)
 * @property {number} [rotation]              degrees the art's centre is turned from facing the camera (default 0)
 * @property {number} [ellipse_top]           px the top edge sags at the front vs its ends (camera pitch; + = from above)
 * @property {number} [ellipse_bottom]        same for the bottom edge
 *
 * @typedef {object} MockupDisplacement       offset = (luminance − neutral) / 255 × strength px, both axes (Photoshop Displace)
 * @property {string} [map]                   PNG, luminance (one of map / from)
 * @property {'base'} [from]                  derive from the base photo: luminance stretched over the placement footprint
 * @property {number} strength                peak-to-peak px
 * @property {number} [strength_x]            per-axis override
 * @property {number} [strength_y]
 * @property {number} [neutral]               luminance with no offset (default 128)
 *
 * @typedef {object} MockupShading
 * @property {'multiply'|'screen'} mode       multiply darkens (white = no change); screen lightens (black = no change)
 * @property {string} [map]                   PNG; RGB used, alpha scales the opacity (one of map / from)
 * @property {'base'} [from]                  multiply: base luminance ÷ its 98th percentile in the footprint (lit surface =
 *                                            no change); screen: base luminance above `threshold`
 * @property {number} [opacity]               0..1 (default 1)
 * @property {number} [threshold]             screen from base: luminance 0..1 where highlights start (default 0.8)
 */

const num = { type: 'number' };
const point = { type: 'array', items: num, minItems: 2, maxItems: 2 };
const file = { type: 'string', minLength: 1 };
const frac = { type: 'number', minimum: 0, maximum: 1 };
const rect = (n, size) => ({ type: 'object', required: ['x', 'y', 'w', 'h'], additionalProperties: false, properties: { x: n, y: n, w: size, h: size } });
const oneSource = { oneOf: [{ required: ['map'] }, { required: ['from'] }] };

export const TEMPLATE_SCHEMA = {
  type: 'object',
  required: ['base', 'placements', 'licence'],
  additionalProperties: false,
  properties: {
    $schema: { type: 'string' },
    id: { type: 'string' },
    version: { type: ['integer', 'string'] },
    base: file,
    placements: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'kind'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_.-]*$' },
          kind: { enum: ['quad', 'cylinder', 'mesh'] },
          quad: { type: 'array', items: point, minItems: 4, maxItems: 4 },
          cylinder: {
            type: 'object',
            required: ['axis_x', 'top', 'bottom', 'radius'],
            additionalProperties: false,
            properties: { axis_x: num, top: num, bottom: num, radius: num, visible_arc: num, art_arc: num, rotation: { type: 'number', minimum: -180, maximum: 180 }, ellipse_top: num, ellipse_bottom: num },
          },
          mesh: { type: 'array', minItems: 2, maxItems: 65, items: { type: 'array', minItems: 2, maxItems: 65, items: point } },
          region: rect({ type: 'integer', minimum: 0 }, { type: 'integer', minimum: 1 }),
          art_region: rect(frac, { type: 'number', exclusiveMinimum: 0, maximum: 1 }),
          aspect: { type: 'number', exclusiveMinimum: 0 },
          fit: { enum: ['contain', 'cover', 'stretch'] },
          feather: { type: 'number', minimum: 0, maximum: 32 },
          mask: file,
          displacement: {
            type: 'object',
            required: ['strength'],
            additionalProperties: false,
            properties: { map: file, from: { const: 'base' }, strength: { type: 'number', minimum: 0, maximum: 256 }, strength_x: num, strength_y: num, neutral: { type: 'number', minimum: 0, maximum: 255 } },
            ...oneSource,
          },
          shading: {
            type: 'array',
            items: {
              type: 'object',
              required: ['mode'],
              additionalProperties: false,
              properties: { mode: { enum: ['multiply', 'screen'] }, map: file, from: { const: 'base' }, opacity: frac, threshold: { type: 'number', minimum: 0, exclusiveMaximum: 1 } },
              ...oneSource,
            },
          },
          notes: { type: 'string' },
        },
        allOf: ['quad', 'cylinder', 'mesh'].map((k) => ({ if: { properties: { kind: { const: k } } }, then: { required: [k] } })),
      },
    },
    licence: {
      type: 'object',
      required: ['source', 'terms', 'client_use_allowed'],
      additionalProperties: false,
      properties: { source: { type: 'string', minLength: 1 }, terms: { type: 'string', minLength: 1 }, client_use_allowed: { enum: [true, false, 'unknown'] }, notes: { type: 'string' } },
    },
    notes: { type: 'string' },
    meta: { type: 'object' },
  },
};

let _validate;
const validate = () => (_validate ??= new Ajv2020({ allErrors: true, strict: false }).compile(TEMPLATE_SCHEMA));

/** Load and check a template package. Throws one clear line per problem class. */
export function loadTemplate(dir) {
  const root = path.resolve(dir);
  const file = path.join(root, 'template.json');
  if (!fs.existsSync(file)) throw new Error(`no template.json in ${root}`);
  let spec;
  try {
    spec = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`template.json is not valid JSON (${e.message})`);
  }
  const v = validate();
  if (!v(spec)) throw new Error(`template.json: ${formatErrors(v.errors)}`);
  const dup = spec.placements.map((p) => p.id).find((id, i, all) => all.indexOf(id) !== i);
  if (dup) throw new Error(`template.json: placement id "${dup}" is used twice`);
  const files = {};
  const ref = (rel, what) => {
    const abs = path.resolve(root, rel);
    if (path.isAbsolute(rel) || path.relative(root, abs).split(path.sep)[0] === '..') throw new Error(`template.json: ${what} "${rel}" must be a path inside the template directory`);
    if (!fs.existsSync(abs)) throw new Error(`template.json: ${what} "${rel}" not found`);
    files[rel] = abs;
    return abs;
  };
  const base = ref(spec.base, 'base');
  const size = imageSize(base);
  const placements = spec.placements.map((p) => {
    const at = `placement "${p.id}"`;
    let mapper;
    try {
      mapper = makeMapper(p);
    } catch (e) {
      throw new Error(`template.json: ${at}: ${e.message}`);
    }
    const r = p.region;
    if (r && (r.x + r.w > size.width || r.y + r.h > size.height)) throw new Error(`template.json: ${at}: region ${r.x},${r.y} ${r.w}x${r.h} is outside the ${size.width}x${size.height} base`);
    const ar = p.art_region;
    if (ar && (ar.x + ar.w > 1 + 1e-9 || ar.y + ar.h > 1 + 1e-9)) throw new Error(`template.json: ${at}: art_region must stay within 0..1`);
    return {
      ...p,
      mapper,
      maskFile: p.mask ? ref(p.mask, `${at} mask`) : null,
      displacementFile: p.displacement?.map ? ref(p.displacement.map, `${at} displacement map`) : null,
      shadingFiles: (p.shading ?? []).map((l, i) => (l.map ? ref(l.map, `${at} shading[${i}] map`) : null)),
    };
  });
  for (const [rel, abs] of Object.entries(files)) {
    const s = rel === spec.base ? size : imageSize(abs);
    if (s.width !== size.width || s.height !== size.height) throw new Error(`template.json: ${rel} is ${s.width}x${s.height}; template maps must match the ${size.width}x${size.height} base`);
  }
  const hashes = Object.fromEntries(Object.entries(files).map(([rel, abs]) => [rel, sha256File(abs)]));
  return { dir: root, file, spec, id: spec.id ?? path.basename(root), base: { file: base, width: size.width, height: size.height, format: size.format }, placements, files: hashes, abs: files, hash: hashValue({ template: spec, files: hashes }), licence: spec.licence };
}

/**
 * The licence gate. client_use_allowed false: blocked (never rendered). 'unknown': rendered with a loud warning, or
 * quietly labelled internal with --internal. true: cleared.
 */
export function licenceGate(licence, { internal = false } = {}) {
  const what = `source: ${licence.source}; terms: ${licence.terms}`;
  if (licence.client_use_allowed === false) return { status: 'blocked', client_facing: false, error: `BLOCKED: the template licence does not allow client use (${what}). Use a template you hold rights to, or record a licence that allows it in template.json.` };
  if (licence.client_use_allowed === true) return { status: 'cleared', client_facing: true };
  if (internal) return { status: 'internal', client_facing: false };
  return { status: 'unknown', client_facing: false, warning: `WARNING: template licence unknown (${what}); this render is NOT cleared for client-facing use. Record the licence in template.json, or pass --internal for internal comps.` };
}

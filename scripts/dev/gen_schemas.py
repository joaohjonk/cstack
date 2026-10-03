"""One-off generator for cstack schemas. The JSON files in schemas/ are the source of truth after generation;
edit them directly. Kept for provenance of the initial shapes."""
import json, os
D = os.path.join(os.path.dirname(__file__), "..", "..", "schemas")
C = "common.schema.json#/$defs/"
def ref(n): return {"$ref": C + n}
def S(id_, title, desc, props, required, extra=None):
    s = {"$schema": "https://json-schema.org/draft/2020-12/schema", "$id": f"https://cstack.dev/schemas/{id_}.schema.json",
         "title": title, "description": desc, "type": "object", "required": required, "properties": props}
    if extra: s.update(extra)
    json.dump(s, open(os.path.join(D, f"{id_}.schema.json"), "w"), indent=2); print("wrote", id_)
STR = {"type": "string"}; ARR_S = {"type": "array", "items": STR}; NUM = {"type": "number"}; BOOL = {"type": "boolean"}

# ---------- creative brief (output of /office-hours) ----------
S("creative-brief", "Creative brief / creative design doc",
  "Output of /office-hours (section 26). Downstream skills consume this instead of re-asking. Inputs are classified per section 3.4.",
  {"id": ref("id"), "brand_id": STR, "date": ref("date"),
   "requested_artifact": STR, "recommended_artifact": {"type": "string", "description": "may differ from what was asked; say why in reframe"},
   "reframe": STR,
   "job_of_the_piece": STR,
   "mode": {"enum": ["brand_building", "conversion", "culture", "mixed"]},
   "audience": {"type": "object", "properties": {"who": STR, "think": STR, "feel": STR, "do": STR}},
   "product_truth": {"type": "array", "items": STR, "description": "facts that carry the idea; each must resolve to brand state"},
   "tension": STR,
   "conventions": {"type": "array", "items": {"type": "object", "required": ["convention", "move"], "properties": {"convention": STR, "move": {"enum": ["use", "invert", "ignore"]}, "why": STR}}},
   "permission": {"type": "string", "description": "what this brand may do that competitors may not"},
   "inevitability_test": {"type": "string", "description": "what would make it feel inevitable rather than decorated"},
   "inputs": {"type": "array", "items": {"type": "object", "required": ["item", "class"], "properties": {"item": STR, "class": ref("input_class"), "source": ref("source_ref")}}},
   "scope": {"type": "string", "description": "core or campaign id"},
   "surfaces": ARR_S, "deliverables": ARR_S,
   "success_criteria": {"type": "array", "items": {"type": "object", "properties": {"axis": ref("judgment_axes"), "criterion": STR}}},
   "constraints": {"type": "object", "properties": {"budget": ref("money"), "deadline": STR, "markets": ARR_S}},
   "open_questions": {"type": "array", "items": {"type": "object", "required": ["question", "default"], "properties": {"question": STR, "default": STR, "owner": STR}}},
   "handoff": ARR_S},
  ["id", "brand_id", "requested_artifact", "job_of_the_piece", "inputs"])

# ---------- brand world ----------
kinds = ["PRODUCT", "PACKAGING", "CAST", "LOCATION", "PROP", "SURFACE", "LIGHT", "WARDROBE", "CAMERA", "GRAPHIC_DEVICE", "TYPE_TREATMENT", "MOTION_BEHAVIOR", "SOUND", "CAMPAIGN_DIRECTION"]
S("brand-world", "Brand world / entity system",
  "Section 6. Reusable, addressable entities (@PRODUCT_STICK_01). Locked entities may only be used, never re-imagined.",
  {"brand_id": STR, "entities": {"type": "array", "items": {"type": "object", "required": ["id", "kind", "description", "immutable_traits", "status"], "additionalProperties": False, "properties": {
      "id": {"type": "string", "pattern": "^(" + "|".join(kinds) + ")_[A-Z0-9_]+$"},
      "kind": {"enum": kinds},
      "name": STR, "description": STR,
      "status": {"enum": ["locked", "current", "testing", "deprecated"]},
      "canonical_files": {"type": "array", "items": {"type": "object", "required": ["path", "role"], "properties": {"path": STR, "role": {"enum": ["master", "reference", "mask", "vector", "3d", "spec"]}, "sha256": STR}}},
      "immutable_traits": ARR_S, "allowed_variation": ARR_S, "forbidden_drift": ARR_S,
      "reference_images": ARR_S,
      "model_notes": {"type": "array", "items": {"type": "object", "required": ["model_id", "note"], "properties": {"model_id": STR, "note": STR, "last_verified": STR, "evidence": STR}}},
      "generation_history": ARR_S,
      "scope": STR, "sources": {"type": "array", "items": ref("source_ref")}}}}},
  ["brand_id", "entities"])

# ---------- reference ----------
S("reference", "Reference (with mechanism)",
  "Sections 7-8. A reference is stored with WHY it works. Separates transferable mechanism from incidental content and literal elements that must not be copied.",
  {"id": ref("id"), "kind": {"enum": ["image", "video", "site", "deck", "packaging", "typography", "campaign", "text", "other"]},
   "library": {"enum": ["canon", "gold", "anti", "inspiration", "competitor", "own_asset"]},
   "uri": STR, "local_path": STR, "sha256": STR,
   "rights": {"type": "object", "required": ["status"], "properties": {"status": {"enum": ["owned", "licensed", "inspiration_only", "unknown"]}, "holder": STR, "notes": STR}},
   "credit": {"type": "string", "description": "who made it; never placed in a generation prompt"},
   "captured_at": ref("date"), "retrieved_via": {"type": "string", "description": "skill/provider that found it (taste-search, cosmos, manual)"},
   "shot_dna_ref": STR,
   "transferable_mechanism": {"type": "string", "description": "the MECHANISM (Source -> Mechanism -> Transfer). Test: remove the image and the principle still explains itself."},
   "source_domain": {"type": "string", "description": "the field the reference comes from (category, fashion, architecture, publishing, ritual, interfaces ...)"},
   "distance": {"enum": ["near", "middle", "far"], "description": "associative distance from the brand's category: near improves fluency, far creates leverage. A healthy packet mixes them."},
   "mechanism_tags": {"type": "array", "description": "search the graph by mechanism: ritual, compression, modularity, reveal, scarcity, wayfinding, restraint ...", "items": STR},
   "transfer": {"type": "string", "description": "how the mechanism lands in this brand's work (casting, pacing, packaging, layout, behaviour), not the look"},
   "incidental_content": ARR_S, "do_not_copy": ARR_S,
   "why_it_works": STR, "why_it_fails": {"type": "string", "description": "required when library = anti"},
   "anti_category": {"enum": ["too_luxury", "too_generic_dtc", "too_wellness", "too_tech", "too_editorial", "too_sterile", "too_ai", "wrong_cultural_register", "wrong_product_fidelity", "wrong_type_behavior", "beautiful_but_not_this_brand", "other"]},
   "axes": {"type": "object", "propertyNames": ref("judgment_axes"), "additionalProperties": {"type": "string"}},
   "tags": ARR_S, "surfaces": ARR_S, "approval": ref("approval"), "decided_by": STR},
  ["id", "kind", "library", "rights", "transferable_mechanism"],
  {"allOf": [{"if": {"properties": {"library": {"const": "anti"}}}, "then": {"required": ["why_it_fails"]}}]})

# ---------- shot dna ----------
cam = {"type": "object", "properties": {k: STR for k in ["format", "focal_length_equivalent", "distance", "height", "angle", "perspective"]}}
dna_fields = ["what", "why", "message", "subject", "action", "human_behavior", "product_role", "composition", "lighting", "exposure_behavior", "focus_behavior", "motion_behavior", "materials", "surfaces", "wardrobe", "props", "environment", "color_logic", "texture", "imperfection", "post_process", "emotional_temperature", "cultural_signal", "transferable_mechanism", "brand_fit"]
props = {k: STR for k in dna_fields}
props.update({"id": ref("id"), "source": {"enum": ["reference", "proposed", "produced"]}, "reference_id": STR, "shot_role": {"enum": ["ICON", "WORLD", "HUMAN", "RITUAL", "PRODUCT", "DETAIL", "CULTURE", "WEIRD", "PROOF", "CLOSER"]},
              "camera": cam, "do_not_copy": ARR_S, "risks": ARR_S, "entities": {"type": "array", "items": ref("entity_ref")},
              "lighting_recipe": {"type": "string", "description": "id from the photographic recipe library (e.g. LIGHT_flash_underexposed_ambient)"},
              "imperfections": {"type": "array", "items": {"type": "object", "required": ["kind", "purpose"], "properties": {"kind": STR, "purpose": STR}}, "description": "anti-AI realism layer; each needs a purpose that serves the art direction"},
              "fixed": {"type": "array", "items": STR, "description": "dimension names locked for refinement (section 3.7)"}})
S("shot-dna", "Shot DNA", "Section 7. Decomposes a reference or a proposed photograph into transferable decisions. Store why it works, not only the image.",
  props, ["id", "source", "what", "why", "camera", "composition", "lighting", "transferable_mechanism", "do_not_copy"])

# ---------- campaign ----------
S("campaign", "Campaign", "Sections 14 and 10 (/campaign). A campaign is a sequence of shot roles, evaluated as a sequence.",
  {"id": ref("id"), "brand_id": STR, "brief_ref": STR, "status": {"enum": ["draft", "territories", "selected", "production", "review", "live", "closed"]},
   "cultural_scan_ref": STR, "strategic_tension": STR,
   "territories": {"type": "array", "items": {"type": "object", "required": ["id", "idea"], "properties": {"id": STR, "idea": STR, "tension": STR, "reference_mechanisms": ARR_S, "risks": ARR_S, "selected": BOOL, "why": STR}}},
   "idea": STR, "direction_entity": STR,
   "sequence": {"type": "array", "items": {"type": "object", "required": ["slot", "role"], "properties": {"slot": STR, "role": {"enum": ["ICON", "WORLD", "HUMAN", "RITUAL", "PRODUCT", "DETAIL", "CULTURE", "WEIRD", "PROOF", "CLOSER"]}, "job": STR, "shot_dna_ref": STR, "artifact_ref": STR, "copy_ref": STR}}},
   "channels": {"type": "array", "items": {"type": "object", "properties": {"channel": STR, "formats": ARR_S, "adaptations": STR}}},
   "sequence_review": {"type": "object", "properties": {"coherence": STR, "redundancy": STR, "missing_roles": ARR_S, "verdict": {"enum": ["pass", "revise", "fail"]}}},
   "experiment_ids": ARR_S, "expires": STR},
  ["id", "brand_id", "status"])

# ---------- prompt recipe ----------
mods = ["objective", "subject", "product_lock", "scene", "behavior", "action", "composition", "camera", "lighting", "materials", "surface", "color_logic", "imperfection", "post_process", "brand_constraints", "reference_mapping", "negative_constraints"]
S("prompt-recipe", "Prompt recipe", "Section 12. A prompt is a compiled output. Recipe = template with named slots + slot values + reference roles + target compiler. The compiler fails on missing or unused slots.",
  {"id": ref("id"), "version": {"type": "integer", "minimum": 1}, "parent": STR,
   "task": {"enum": ["text_to_image", "image_edit", "image_to_video", "text_to_video", "vector", "typography_image", "product_placement", "copy"]},
   "target_model": STR, "compiler": STR,
   "template": {"type": "string", "description": "stable instruction text with {slot} placeholders; stable prefix first"},
   "slots": {"type": "object", "additionalProperties": {"type": "object", "properties": {"required": BOOL, "description": STR, "variants": {"type": "array", "items": STR, "description": "deterministic pool addressed by index/seed"}}}},
   "values": {"type": "object", "additionalProperties": STR},
   "variant_index": {"type": "object", "additionalProperties": {"type": "integer"}},
   "modules": {"type": "object", "properties": {m: STR for m in mods}},
   "references": {"type": "array", "items": {"type": "object", "required": ["ref", "role"], "properties": {"ref": STR, "role": {"enum": ["product_lock", "composition", "lighting", "palette", "cast", "location", "style_mechanism", "mask", "init_image"]}, "weight": NUM}}},
   "parameters": {"type": "object"},
   "shot_dna_ref": STR, "brief_ref": STR,
   "less_text_more_refs": {"type": "boolean", "description": "compiler hint: references carry the look, text stays short"},
   "compiled": {"type": "object", "properties": {"prompt": STR, "negative": STR, "hash": STR, "compiled_at": STR}}},
  ["id", "version", "task", "template", "slots"])

# ---------- canon entry ----------
S("canon-entry", "Canon entry (practitioner / world index)",
  "Section 28. Retrievable reasoning, not authority worship: a person, studio, work, place or scene recorded for the MENTAL MODEL it contributes, when it helps, when it misleads, and the tensions it carries. Never used to imitate a living person's voice or to put a name in a generation prompt.",
  {"id": {"type": "string", "pattern": "^[a-z0-9][a-z0-9-]*$"},
   "name": STR,
   "kind": {"enum": ["person", "studio", "brand", "book", "publication", "campaign", "artifact", "place", "scene", "institution", "framework"]},
   "domains": ARR_S,
   "mental_model": {"type": "string", "description": "one line: what way of thinking this entry contributes (e.g. reduction + systems; relational perception)"},
   "mechanisms": {"type": "array", "description": "transferable mechanisms, each usable without naming the source", "items": STR},
   "representative_works": ARR_S,
   "when_useful": ARR_S, "when_not_useful": ARR_S, "tensions": ARR_S,
   "distance_from": {"type": "object", "description": "category -> near|middle|far, so the canon can be searched by associative distance", "additionalProperties": {"enum": ["near", "middle", "far"]}},
   "sources": {"type": "array", "items": ref("source_ref")},
   "added_by": STR, "added": ref("date"), "status": {"enum": ["current", "testing", "historical", "deprecated"]}},
  ["id", "name", "kind", "domains", "mental_model", "mechanisms", "when_useful", "when_not_useful"])

# ---------- model registry ----------
S("model-registry", "Model registry", "Section 11. Living, snapshot-dated facts about models. Prices and latency are snapshots, never permanent truth.",
  {"updated": ref("date"), "models": {"type": "array", "items": {"type": "object", "required": ["model_id", "provider", "modality", "capabilities", "last_verified", "source"], "properties": {
      "model_id": STR, "provider": STR, "provider_model_id": {"type": "string", "description": "exact endpoint/model name at the provider"},
      "modality": {"enum": ["image", "video", "vector", "audio", "text", "analysis", "3d"], "description": "output family; what the model can DO is in capabilities"},
      "capabilities": {"type": "array", "description": "open kebab-case vocabulary, e.g. text-to-image, image-edit, multi-image-reference, mask-inpainting, image-to-video, text-rendering, text-to-vector-svg; route by these, never by model name", "items": {"type": "string", "pattern": "^[a-z0-9][a-z0-9-]*$"}},
      "known_strengths": ARR_S, "known_weaknesses": ARR_S, "input_types": ARR_S,
      "max_refs": {"type": ["integer", "null"]}, "resolution": {"type": ["string", "null"]},
      "pricing_snapshot": {"oneOf": [ref("snapshot"), {"type": "null"}]}, "latency_snapshot": {"oneOf": [ref("snapshot"), {"type": "null"}]},
      "licensing": {"type": ["string", "null"]}, "api": {"type": "object", "properties": {"async": BOOL, "webhooks": BOOL, "idempotency": STR, "caching": STR}},
      "last_verified": {"type": ["string", "null"]}, "source": {"oneOf": [STR, ARR_S]},
      "access": {"type": "string", "description": "how it is reachable: direct, fal, Runway, Higgsfield CLI ... (aggregator prices differ: separate rows when they matter)"},
      "notes": {"type": ["string", "null"]},
      "est_unit_cost": {"type": ["object", "null"], "description": "router-usable single number derived from pricing_snapshot; null when token-priced or unknown (estimate before spending)", "required": ["amount", "currency", "per"], "properties": {"amount": {"type": "number"}, "currency": STR, "per": {"enum": ["image", "second", "megapixel", "operation"]}, "basis": STR}},
      "benchmark_results": {"type": "array", "items": {"type": "object", "required": ["task", "date", "result"], "properties": {"task": STR, "date": STR, "result": STR, "experiment_id": STR}}},
      "confidence": ref("confidence"), "status": {"enum": ["active", "watch", "deprecated", "shut_down"]}}}}},
  ["updated", "models"])

# ---------- eval record ----------
S("eval", "Eval record", "Section 18. One judgment on one artifact. Layered: gates are pass/fail; axes are separate; never one scalar unless a workflow declares a weighted composite.",
  {"id": ref("id"), "artifact_ref": STR, "artifact_version": STR, "date": ref("date"),
   "evaluator": {"type": "object", "required": ["kind", "name"], "properties": {"kind": {"enum": ["deterministic", "llm_judge", "vision_judge", "provider_verifier", "human"]}, "name": STR, "model": STR, "separate_from_author": BOOL}},
   "baseline": {"type": "string", "description": "what this is judged relative to: brief, reference, incumbent, previous approved (section 1.4A, Trail of Bits)"},
   "gates": {"type": "array", "items": {"type": "object", "required": ["id", "result"], "properties": {"id": STR, "result": {"enum": ["pass", "warn", "fail", "pending", "n/a"]}, "evidence": STR}}},
   "axes": {"type": "array", "items": {"type": "object", "required": ["axis", "score"], "properties": {"axis": ref("judgment_axes"), "score": {"type": ["number", "null"], "minimum": 0, "maximum": 2}, "anchor": {"type": "string", "description": "anchor case cited"}, "evidence": STR}}},
   "lenses": {"type": "array", "description": "section 27 independent reviewer lenses; disagreement survives", "items": {"type": "object", "required": ["lens", "verdict"], "properties": {"lens": {"enum": ["strategist", "brand_director", "art_director", "photographer", "type_director", "editor", "culture", "copy", "commerce", "production", "compliance"]}, "verdict": {"enum": ["ship", "revise", "kill"]}, "reason": STR, "fix": STR}}},
   "provider_verdict": {"type": "object", "properties": {"provider": STR, "job_id": STR, "score": NUM, "recommendations": ARR_S}},
   "failures": {"type": "array", "items": ref("failure_type")},
   "recommendations": ARR_S,
   "decision": {"enum": ["promote", "fix", "reject", "human_review", "pending"]},
   "tradeoff": {"type": "string", "description": "the orchestrator's explicit tradeoff when lenses disagree"},
   "cost": ref("money")},
  ["id", "artifact_ref", "date", "evaluator", "decision"])

# ---------- artifact lineage / creative commit ----------
S("artifact-lineage", "Artifact lineage (creative commit)", "Section 22. Every significant artifact version knows its parent, intent, changed/unchanged dimensions, inputs, recipe, model and decisions. Written as a sidecar next to the output file.",
  {"artifact_id": ref("id"), "version": {"type": "integer", "minimum": 1}, "parent_version": {"type": ["integer", "null"]},
   "kind": {"enum": ["image", "video", "copy", "page", "deck", "packaging", "audio", "other"]},
   "brief_ref": STR, "shot_dna_ref": STR,
   "intent_of_change": STR, "changed_dimensions": ARR_S, "unchanged_dimensions": ARR_S,
   "operation": {"enum": ["generate", "edit", "inpaint", "composite", "upscale", "grade", "crop", "layout", "write", "deterministic_transform", "human_edit"]},
   "references": {"type": "array", "items": {"type": "object", "required": ["ref", "role"], "properties": {"ref": STR, "role": STR}}},
   "prompt_recipe": {"type": "object", "properties": {"id": STR, "version": {"type": "integer"}, "hash": STR, "compiled_prompt": STR}},
   "model": {"type": "object", "properties": {"provider": STR, "model_id": STR, "settings": {"type": "object"}, "seed": {"type": ["integer", "string", "null"]}}},
   "asset_inputs": {"type": "array", "items": {"type": "object", "required": ["path"], "properties": {"path": STR, "sha256": STR}}},
   "output_files": {"type": "array", "items": {"type": "object", "required": ["path"], "properties": {"path": STR, "sha256": STR, "width": {"type": "integer"}, "height": {"type": "integer"}}}},
   "run_id": {"type": "string", "description": "cost ledger run id"},
   "review": {"type": "object", "properties": {"eval_ids": ARR_S, "summary": STR}},
   "human_decision": {"type": "object", "properties": {"decision": {"enum": ["gold", "approve", "reject", "anti", "pending"]}, "by": STR, "date": STR, "reason": STR}},
   "result": {"enum": ["promoted", "rejected", "pending", "superseded"]},
   "created_at": STR,
   "brand_refs": {"type": "object", "description": "brand-system field paths (section.field) -> hash of the value used. `cstack brand stale` lists artifacts whose inputs changed (dependency-revision invalidation).", "additionalProperties": {"type": "string"}},
   "skill": STR, "skills_lock": {"type": "string", "description": "hash of SKILLS.lock at generation time"}},
  ["artifact_id", "version", "kind", "intent_of_change", "operation", "output_files", "result"])

# ---------- feedback event ----------
S("feedback-event", "Human feedback event", "Section 21. Preference data: approvals, rejections, gold/anti, A/B pairs, free text, region critique. Preference pairs are first-class.",
  {"id": ref("id"), "date": STR, "by": STR, "brand_id": STR,
   "type": {"enum": ["approve", "reject", "gold", "anti", "pairwise", "comment", "region_critique", "edit"]},
   "artifact_ref": STR, "artifact_version": {"type": "integer"},
   "pair": {"type": "object", "properties": {"a": STR, "b": STR, "winner": {"enum": ["a", "b", "tie", "neither"]}, "margin": {"enum": ["slight", "clear", "decisive"]}}},
   "region": {"type": "object", "properties": {"x": NUM, "y": NUM, "w": NUM, "h": NUM, "unit": {"enum": ["px", "fraction"]}}},
   "reason": STR, "reason_codes": ARR_S,
   "general_principle": {"type": "string", "description": "what this says about taste in general (candidate learning)"},
   "project_specific": {"type": "string", "description": "what is only true for this brief/brand/campaign"},
   "axes": {"type": "array", "items": ref("judgment_axes")},
   "context": {"type": "object", "properties": {"surface": STR, "scope": STR, "brief_ref": STR}}},
  ["id", "date", "by", "type", "artifact_ref"])

# ---------- cost ledger ----------
S("cost-ledger-entry", "Cost / latency ledger entry", "Section 11. One line per provider call in state/cost-ledger.jsonl.",
  {"run_id": STR, "ts": STR, "provider": STR, "model": STR, "operation": STR, "input_hashes": ARR_S, "prompt_recipe_hash": STR,
   "idempotency_key": STR, "cache_status": {"enum": ["hit", "miss", "n/a"]},
   "estimated_cost": {"oneOf": [ref("money"), {"type": "null"}]}, "actual_cost_if_available": {"oneOf": [ref("money"), {"type": "null"}]},
   "latency_ms": {"type": ["integer", "null"]}, "output_ids": ARR_S, "retry_count": {"type": "integer", "minimum": 0},
   "status": {"enum": ["dry_run", "queued", "ok", "failed_transient", "failed_policy", "failed_other", "deduplicated", "budget_blocked"]},
   "experiment_id": STR, "skill": STR, "error": STR},
  ["run_id", "ts", "provider", "operation", "status"])

# ---------- experiment run ----------
S("experiment-run", "Experiment run spec", "Section 12A. Bounded keep/discard loop over a frozen fixture and evaluator.",
  {"run_id": ref("id"), "fixture": STR, "baseline_version": STR, "mutable_surface": {"type": "string", "description": "the ONE thing that may change (e.g. prompt.slot.lighting, model, ref_set, crop)"},
   "frozen": ARR_S, "primary_metric": {"type": "object", "required": ["name", "method"], "properties": {"name": STR, "method": {"enum": ["pairwise_vs_incumbent", "rubric_axis", "deterministic", "human_pref", "provider_score"]}, "higher_is_better": BOOL}},
   "guardrails": {"type": "array", "items": {"type": "object", "required": ["name", "rule"], "properties": {"name": STR, "rule": STR}}},
   "regression_fixtures": ARR_S,
   "time_budget_minutes": NUM, "spend_budget": ref("money"), "max_experiments": {"type": "integer", "minimum": 1},
   "stop_conditions": ARR_S, "evaluator": STR, "seeds_per_candidate": {"type": "integer", "minimum": 1},
   "program": {"type": "string", "description": "path to the human-editable program.md that steers proposals"}},
  ["run_id", "fixture", "baseline_version", "mutable_surface", "primary_metric", "guardrails", "spend_budget", "max_experiments", "stop_conditions"])

# ---------- learning event ----------
S("learning-event", "Learning event / promoted learning", "Section 28A. Raw events append to state/learnings.jsonl; promoted ones also land in docs/learnings.md or a skill/provider note/eval.",
  {"id": ref("id"), "date": STR, "kind": {"enum": ["observation", "failure", "approval", "model_quirk", "performance", "human_edit", "candidate", "promoted", "retired"]},
   "statement": STR, "scope": {"enum": ["durable", "brand_specific", "campaign_specific", "model_specific", "tool_specific"]},
   "brand_id": STR, "provider": STR, "artifact_type": STR, "confidence": ref("confidence"),
   "evidence": {"type": "array", "items": ref("source_ref")}, "replaces": STR,
   "should_become": {"enum": ["principle", "skill_rule", "provider_note", "eval", "anti_example", "fixture", "archive_only"]},
   "target": {"type": "string", "description": "file/skill where it was promoted"},
   "expires": STR, "approved_by": STR, "tags": ARR_S},
  ["id", "date", "kind", "statement", "scope", "confidence"])

# ---------- failure event ----------
S("failure-event", "Failure event", "Section 20. Structured failure with diagnosis and whether the repair worked.",
  {"id": ref("id"), "date": STR, "type": ref("failure_type"), "artifact_ref": STR, "task": STR, "model": STR, "refs": ARR_S, "prompt_recipe": STR,
   "evaluator_result": STR, "human_feedback": STR, "diagnosis": STR, "repair": STR, "repair_worked": {"type": ["boolean", "null"]}, "brand_id": STR, "learning_id": STR},
  ["id", "date", "type", "artifact_ref", "diagnosis"])

# ---------- cultural signal ----------
S("cultural-signal", "Cultural signal", "Section 15. Observation, not 'Gen Z' adjectives.",
  {"id": ref("id"), "signal": STR, "source": STR, "date": STR, "community": STR, "stage": {"enum": ["fringe", "emerging", "mainstream", "fatiguing"]},
   "intelligence": {"enum": ["aesthetic", "cultural", "brand"]}, "why_it_matters": STR, "relevance_to_brand": STR,
   "risk": {"type": "object", "properties": {"cringe": STR, "appropriation": STR, "lateness": STR}}, "brand_behavior": {"type": "string", "description": "what the brand could DO, not only content idea"},
   "observed_vs_inferred": {"enum": ["observed", "inferred"]}},
  ["id", "signal", "source", "date", "stage", "why_it_matters"])

# ---------- competitor observation ----------
S("competitor-observation", "Competitor observation", "Section 16. Normalized observation; observation and inference are separate fields.",
  {"id": ref("id"), "competitor": STR, "url": STR, "captured_at": STR, "screenshot": STR, "channel": STR,
   "observed": {"type": "object", "properties": {k: STR for k in ["positioning", "offer", "claim", "proof", "hook", "creative_format", "visual_grammar", "casting", "product_role", "cta"]}},
   "performance_proxy": {"type": "object", "properties": {"metric": STR, "value": STR, "source": STR}},
   "inference": STR, "access": {"enum": ["public", "user_provided", "authenticated_with_permission"]}},
  ["id", "competitor", "captured_at", "observed", "access"])

# ---------- creative performance ----------
S("creative-performance", "Creative performance record", "Section 17. Creative feature decomposition + metrics. Observational data never implies causation.",
  {"id": ref("id"), "artifact_ref": STR, "experiment_id": STR, "channel": STR, "period": STR, "audience": STR,
   "features": {"type": "object", "properties": {k: STR for k in ["hook_type", "first_frame", "product_timing", "face", "setting", "appeal", "message", "headline_architecture", "copy_density", "pacing", "shot_count", "camera_behavior", "visual_novelty", "creator_vs_studio", "cta", "duration", "offer", "landing_page_match"]}},
   "variable_tested": STR, "metrics": {"type": "object", "additionalProperties": NUM}, "spend": ref("money"),
   "confounds": ARR_S, "read": {"enum": ["repeated", "confounded", "single_observation", "inconclusive"]}, "brand_building_vs_conversion": STR},
  ["id", "artifact_ref", "channel", "metrics"])

# ---------- skill meta ----------
S("skill-meta", "Skill metadata", "Section 9 / 24A. Machine-readable twin of SKILL.md so the runtime can search the catalog without loading every skill.",
  {"slug": {"type": "string", "pattern": "^[a-z0-9][a-z0-9-]*$"}, "type": {"enum": ["capability", "composite", "playbook"]},
   "summary": {"type": "string", "maxLength": 200}, "tags": ARR_S, "triggers": ARR_S, "not_for": ARR_S,
   "required_inputs": ARR_S, "outputs": ARR_S, "reads": ARR_S, "writes": ARR_S,
   "compatible_hosts": {"type": "array", "items": {"enum": ["claude-code", "codex", "cursor", "gemini-cli", "opencode", "any"]}},
   "required_providers": ARR_S, "optional_providers": ARR_S,
   "cost_class": {"enum": ["free", "low", "medium", "high"]}, "context_class": {"enum": ["s", "m", "l"]},
   "mutating": BOOL, "destructive": BOOL, "handoff": ARR_S, "evals": ARR_S, "examples": ARR_S,
   "version": {"type": "string", "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"}, "last_verified": {"type": ["string", "null"]},
   "status": {"enum": ["stable", "beta", "stub", "deprecated"], "description": "promotion past stub needs a linked run record or eval result"}, "phase": STR,
   "approval_gates": {"type": "array", "items": {"type": "object", "required": ["id", "after_step"], "properties": {"id": STR, "after_step": STR, "artifact": STR, "never_self_approve": BOOL}}},
   "depends_on_fields": {"type": "array", "description": "brand-system field paths outputs pin (written to lineage brand_refs)", "items": STR},
   "deterministic_steps": ARR_S, "generative_steps": ARR_S,
   "fallback": {"type": "object", "properties": {"when_missing": ARR_S, "mode": {"enum": ["brief-only", "degraded", "blocked", "local"]}}},
   "output_contract": {"type": "object", "properties": {"path": STR, "schema": STR, "headings": ARR_S}},
   "baseline": {"enum": ["brief", "reference", "last_approved", "incumbent", "absolute", "n/a"], "description": "what this skill's judgments are relative to"},
   "budget": {"type": "object", "properties": {"skill_md_tokens_max": {"type": "integer"}, "refs_tokens_max": {"type": "integer"}}},
   "allowed_tools": ARR_S, "host_overrides": {"type": "object"}, "trigger_eval": STR},
  ["slug", "type", "summary", "triggers", "required_inputs", "outputs", "compatible_hosts", "cost_class", "context_class", "mutating", "destructive", "version", "status"],
  {"additionalProperties": False})

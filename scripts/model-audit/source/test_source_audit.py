"""Standard-library checks: python3 -B -m unittest discover -s .../source -v."""
import ast
import json
from pathlib import Path
import struct
import unittest
from unittest.mock import Mock, patch

from compare_assets import descendant_meshes, index_rows, lookup, normalize, read_glb, system_hints


def glb_bytes(document):
    encoded = json.dumps(document).encode()
    encoded += b" " * (-len(encoded) % 4)
    return struct.pack("<4sII", b"glTF", 2, 20 + len(encoded)) + struct.pack("<II", len(encoded), 0x4E4F534A) + encoded


class MappingTests(unittest.TestCase):
    def test_suffixes_never_removed(self):
        names = ["Nerve.l", "Nerve.r", "Nerve.i", "Nerve.j", "Nerve.g", "Nerve.s", "Nerve.t", "Nerve.st", "Nerve.001", "Nerve"]
        self.assertEqual(len(set(map(normalize, names))), len(names))

    def test_normalization_only_case_whitespace(self):
        self.assertEqual(normalize("  Femur.L  "), "femur.l")
        self.assertNotEqual(normalize("Femur-l"), normalize("Femur.l"))
        self.assertNotEqual(normalize("Femur l"), normalize("Femur.l"))

    def test_exact_and_candidates_separate_duplicates_preserved(self):
        rows = [{"name": "Femur.l", "node_index": 1}, {"name": "femur.l", "node_index": 2}, {"name": "Femur.l", "node_index": 3}]
        result = lookup("Femur.l", index_rows(rows))
        self.assertEqual([r["node_index"] for r in result["exact"]], [1, 3])
        self.assertEqual([r["node_index"] for r in result["normalized_candidates"]], [2])
        self.assertFalse(lookup("Femur.r", index_rows(rows))["exact"])

    def test_unknown_collections_not_discarded_or_forced(self):
        self.assertEqual(system_hints({"collection_paths": [["Scene", "Mystery"]]}), [])

    def test_collection_routing_does_not_guess_from_substrings(self):
        self.assertEqual(system_hints({"collection_paths": [["2: Muscular insertions"]]}), ["insertions"])
        self.assertEqual(system_hints({"collection_paths": [["6: Lymphoid organs"]]}), [])

    def test_actual_glb_json_nodes(self):
        doc = {"nodes": [{"name": "Source.l", "mesh": 0}, {"name": "Helper.i"}, {}]}
        with patch.object(Path, "read_bytes", return_value=glb_bytes(doc)):
            self.assertEqual(read_glb(Path("unused.glb")), doc)

    def test_named_container_descendant_geometry(self):
        nodes = [{"name": "Liver", "children": [1]}, {"children": [2]}, {"mesh": 0}]
        self.assertEqual(descendant_meshes(nodes, 0), [2])
        self.assertEqual(descendant_meshes(nodes, 2), [])

    def test_invalid_or_cyclic_node_graph_rejected(self):
        for nodes in ([{"children": [1]}], [{"children": [0]}]):
            with self.assertRaises(ValueError):
                descendant_meshes(nodes, 0)

    def test_bad_glb_rejected(self):
        for data in (b"bad", glb_bytes({})[:-1], b"nope" + glb_bytes({})[4:]):
            with self.subTest(data=data), patch.object(Path, "read_bytes", return_value=data):
                with self.assertRaises(ValueError):
                    read_glb(Path("unused.glb"))

    def test_chunk_overrun_rejected(self):
        raw = bytearray(glb_bytes({}))
        struct.pack_into("<I", raw, 12, 1024)
        with patch.object(Path, "read_bytes", return_value=raw):
            with self.assertRaises(ValueError):
                read_glb(Path("unused.glb"))


class EvaluationGuardTests(unittest.TestCase):
    def setUp(self):
        # Execute the real extraction function without importing Blender/numpy.
        tree = ast.parse(Path(__file__).with_name("blender_inventory.py").read_text())
        function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "evaluated")
        self.namespace = {"GEOMETRY_TYPES": {"MESH", "CURVE", "FONT"},
            "mesh_stats": Mock(return_value={"vertices": 12, "faces": 6}),
            "matrix": lambda value: value, "traceback": __import__("traceback")}
        exec(compile(ast.Module(body=[function], type_ignores=[]), "blender_inventory.py", "exec"), self.namespace)
        self.evaluate = self.namespace["evaluated"]

    def test_unevaluated_original_is_not_called_empty(self):
        ev = Mock(is_evaluated=False)
        obj = Mock(type="CURVE")
        obj.evaluated_get.return_value = ev
        result = self.evaluate(obj, object(), False)
        self.assertEqual(result["status"], "unavailable_in_depsgraph")
        self.assertNotIn("vertices", result)
        ev.to_mesh.assert_not_called()
        ev.to_mesh_clear.assert_not_called()

    def test_enabled_geometry_and_cleanup(self):
        ev = Mock(is_evaluated=True, matrix_world=[[1]])
        obj = Mock(type="CURVE")
        obj.evaluated_get.return_value = ev
        result = self.evaluate(obj, object(), True)
        self.assertEqual(result["vertices"], 12)
        self.assertEqual(result["status"], "nonempty")
        ev.to_mesh_clear.assert_called_once()

    def test_geometry_error_explicit_and_cleanup(self):
        ev = Mock(is_evaluated=True)
        ev.to_mesh.side_effect = RuntimeError("conversion unavailable")
        obj = Mock(type="FONT")
        obj.evaluated_get.return_value = ev
        result = self.evaluate(obj, object(), True)
        self.assertEqual(result["status"], "error")
        self.assertEqual(result["error_type"], "RuntimeError")
        self.assertIn("conversion unavailable", result["traceback"])
        ev.to_mesh_clear.assert_called_once()


if __name__ == "__main__":
    unittest.main()

import unittest

from stage_summary import census_difference, has_exact_geometry, is_primary_member


class StageSummaryTests(unittest.TestCase):
    def test_exact_catalog_equality_preserves_duplicate_counts(self):
        self.assertTrue(census_difference(["A.l", "A.l"], ["A.l", "A.l"])["exact_name_multisets_equal"])
        result = census_difference(["A.l", "A.l"], ["A.l"])
        self.assertFalse(result["exact_name_multisets_equal"])
        self.assertEqual(result["left_only_names"], ["A.l"])

    def test_rename_case_and_suffix_differences_are_not_identity(self):
        result = census_difference(["Muscle.or", " Nerve.l"], ["Muscle- Insertion.r", "nerve.l"])
        self.assertEqual(result["intersection_count"], 0)
        self.assertEqual(result["left_only_names"], [" Nerve.l", "Muscle.or"])

    def test_numbered_root_primary_membership(self):
        obj = {"collection_paths": [["scene:Scene", "Scene Collection", "6: Lymphoid organs", "Nodes"]]}
        self.assertTrue(is_primary_member(obj, "6: Lymphoid organs"))

    def test_bonus_nested_and_unlinked_names_not_primary(self):
        for path in (["scene:Scene", "Scene Collection", "Bonus collection", "6: Lymphoid organs"],
                     ["unlinked", "Other", "6: Lymphoid organs"]):
            self.assertFalse(is_primary_member({"collection_paths": [path]}, "6: Lymphoid organs"))

    def test_any_valid_primary_path_is_sufficient(self):
        paths = [["scene:Scene", "Scene Collection", "Bonus collection"],
                 ["scene:Scene", "Scene Collection", "7: Nervous system & Sense organs"]]
        self.assertTrue(is_primary_member({"collection_paths": paths}, "7: Nervous system & Sense organs"))

    def test_geometry_evidence_includes_descendants_but_not_empty_nodes(self):
        self.assertTrue(has_exact_geometry({"mesh_index": 0, "descendant_mesh_node_indices": []}))
        self.assertTrue(has_exact_geometry({"mesh_index": None, "descendant_mesh_node_indices": [3]}))
        self.assertFalse(has_exact_geometry({"mesh_index": None, "descendant_mesh_node_indices": []}))


if __name__ == "__main__":
    unittest.main()

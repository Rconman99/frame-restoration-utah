"""Tests for scripts/blog-editorial-pick.py (python3 -m unittest discover -s scripts -p 'test_blog_editorial_pick.py')."""
import importlib.util
import json
import pathlib
import tempfile
import unittest

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("blog_editorial_pick", HERE / "blog-editorial-pick.py")
pick_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pick_mod)
AB = pick_mod._autobrief()
QUEUE = json.loads((HERE.parent / "data" / "blog-editorial-queue.json").read_text(encoding="utf-8"))


def item(slug="reroof-permit-test", city="draper"):
    return {"status": "pending", "slug": slug, "city_slug": city, "city_name": city.title(),
            "service_slug": "roof-replacement", "service_name": "Roof Replacement",
            "keyword": f"reroof permit {city}",
            "editorial": {"reader_question": "When does a reroof need a permit here?",
                          "distinct_angle": "Built only from the city's own permit page.",
                          "local_evidence": [{"claim": "A roof replacement requires a permit.",
                                              "source_url": "https://example.gov/roof",
                                              "source_label": "Example City"}]}}


class PickTests(unittest.TestCase):
    def test_queue_file_items_are_valid(self):
        items = [i for i in QUEUE["items"] if i.get("status", "pending") == "pending"]
        self.assertGreaterEqual(len(items), 1)
        for i in items:
            self.assertEqual(pick_mod.item_issues(i), [], i.get("slug"))
        self.assertEqual(len({i["slug"] for i in items}), len(items))

    def test_alert_row_wins_over_queue(self):
        row = {"city_slug": "highland", "city_name": "Highland", "service_slug": "storm-damage",
               "service_name": "Storm Damage", "keyword": "storm damage roof repair Highland",
               "weather_event": {"hazard": "hail", "event": "Severe Thunderstorm Warning",
                                 "event_context": "NWS warning text",
                                 "source_url": "https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.x"}}
        with tempfile.TemporaryDirectory() as d:
            brief, _ = pick_mod.pick([row], [item()], "", AB, pathlib.Path(d))
        self.assertEqual(brief["pick"], "nws-alert")
        self.assertEqual(brief["city_slug"], "highland")

    def test_forecast_row_does_not_beat_queue(self):
        row = {"city_slug": "highland", "keyword": "x",
               "weather_event": {"hazard": "thunderstorm", "event_context": "forecast text",
                                 "source_url": "https://api.weather.gov/gridpoints/SLC/1,1/forecast"}}
        with tempfile.TemporaryDirectory() as d:
            brief, _ = pick_mod.pick([row], [item()], "", AB, pathlib.Path(d))
        self.assertEqual(brief["pick"], "editorial-queue")
        self.assertEqual(brief["slug"], "reroof-permit-test")
        self.assertTrue(any("Sourced quote" in f for f in brief["facts"]))
        self.assertEqual(brief["sources"][0]["url"], "https://example.gov/roof")

    def test_skips_published_and_open_pr_topics(self):
        with tempfile.TemporaryDirectory() as d:
            root = pathlib.Path(d)
            (root / "blog" / "draper").mkdir(parents=True)
            (root / "blog" / "draper" / "first.html").write_text("x")
            q = [item("first"), item("second"), item("third")]
            brief, notes = pick_mod.pick([], q, "Approve to publish: second", AB, root)
        self.assertEqual(brief["slug"], "third")
        self.assertEqual(len(notes), 2)

    def test_nothing_to_pick(self):
        with tempfile.TemporaryDirectory() as d:
            brief, _ = pick_mod.pick([], [], "", AB, pathlib.Path(d))
        self.assertIsNone(brief)

    def test_statewide_item_gets_statewide_scope(self):
        with tempfile.TemporaryDirectory() as d:
            brief, _ = pick_mod.pick([], [item("statewide-topic", "utah")], "", AB, pathlib.Path(d))
        self.assertEqual(brief["scope"], "statewide")


if __name__ == "__main__":
    unittest.main()

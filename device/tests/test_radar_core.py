import tempfile
import unittest
from pathlib import Path

from radar_core import DeviceStore, LocalRadarEvent, TargetTracker, parse_count_line, parse_radar_line


class ParserTests(unittest.TestCase):
    def test_speed_formats(self):
        self.assertEqual(parse_radar_line("*059,A"), (59, "A"))
        self.assertEqual(parse_radar_line("026,R"), (26, "R"))
        self.assertIsNone(parse_radar_line("garbage"))

    def test_count_formats(self):
        self.assertEqual(parse_count_line("*C,A"), "A")
        self.assertEqual(parse_count_line("C,R"), "R")


class TrackerTests(unittest.TestCase):
    def test_peak_is_consumed_by_count(self):
        tracker = TargetTracker()
        tracker.ingest(55, "A", 1.0)
        tracker.ingest(72, "A", 1.2)
        tracker.ingest(68, "A", 1.4)
        target = tracker.consume_count("A", 1.5)
        self.assertIsNotNone(target)
        self.assertEqual(target.peak_speed, 72)
        self.assertIsNone(tracker.consume_count("A", 1.6))

    def test_late_count_uses_held_target(self):
        tracker = TargetTracker(detection_gap_seconds=.8, count_hold_seconds=3)
        tracker.ingest(81, "A", 10)
        tracker.tick(11)
        target = tracker.consume_count("A", 11.3)
        self.assertEqual(target.peak_speed, 81)

    def test_receding_is_ignored(self):
        tracker = TargetTracker()
        self.assertFalse(tracker.ingest(90, "R", 1))
        self.assertIsNone(tracker.consume_count("R", 2))


class StoreTests(unittest.TestCase):
    def test_event_survives_reopen_and_upload_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "device.db"
            store = DeviceStore(path)
            event = LocalRadarEvent.create(91, 60, "A", Path(directory) / "photo.jpg", "pending")
            store.enqueue_event(event)
            store.close()
            reopened = DeviceStore(path)
            self.assertEqual(len(reopened.pending_events()), 1)
            reopened.mark_event_uploaded(event.device_event_id, "cloud-id")
            self.assertEqual(reopened.pending_events(), [])
            self.assertEqual(reopened.queue_depth(), 0)

    def test_retry_backoff(self):
        with tempfile.TemporaryDirectory() as directory:
            store = DeviceStore(Path(directory) / "device.db")
            event = LocalRadarEvent.create(65, 60, "A", None, "failed")
            store.enqueue_event(event)
            store.mark_event_retry(event.device_event_id, "offline")
            self.assertEqual(store.pending_events(now_epoch=0), [])


if __name__ == "__main__":
    unittest.main()

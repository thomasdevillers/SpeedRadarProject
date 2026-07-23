import importlib
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path

from radar_core import DeviceStore, LocalRadarEvent


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def json(self):
        return self.payload

    def raise_for_status(self):
        return None


class FakeApi:
    def __init__(self):
        self.requests = []

    def request(self, method, path, **kwargs):
        self.requests.append((method, path, kwargs))
        if path == "/api/device/v1/events":
            return FakeResponse({"eventId": "cloud-event", "uploadUrl": None})
        if path == "/api/device/v1/config":
            return FakeResponse({"speedLimitKph": 80, "assignment": None})
        return FakeResponse({"ok": True})


class AgentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        root = Path(cls.temp.name)
        os.environ["ROADSAFE_DATABASE_PATH"] = str(root / "device.db")
        os.environ["ROADSAFE_SPOOL_DIR"] = str(root / "spool")
        os.environ["ROADSAFE_STATE_DIR"] = str(root)
        os.environ["ROADSAFE_LOG_DIR"] = str(root / "logs")
        sys.modules.setdefault("psutil", types.SimpleNamespace())
        sys.modules.setdefault("requests", types.SimpleNamespace(Response=object, post=lambda *args, **kwargs: None))
        cls.module = importlib.import_module("cloud_agent")
        cls.runtime_log = root / "logs" / "cloud-agent.log"

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.store = DeviceStore(Path(self.directory.name) / "device.db")
        self.api = FakeApi()
        self.agent = self.module.Agent(self.api, self.store)

    def tearDown(self):
        self.store.close()
        self.directory.cleanup()

    def test_metadata_event_uploads_and_is_acked(self):
        event = LocalRadarEvent.create(52, 60, "A", None, "not_required")
        self.store.enqueue_event(event)
        self.agent.upload_pending_events()
        self.assertEqual(self.store.queue_depth(), 0)
        self.assertEqual(self.api.requests[0][1], "/api/device/v1/events")

    def test_import_does_not_create_a_privileged_runtime_log(self):
        self.assertFalse(self.runtime_log.exists())

    def test_configuration_is_durable(self):
        self.agent.refresh_config()
        self.assertEqual(self.store.get_config("cloud")["speedLimitKph"], 80)

    def test_activation_preserves_hardware_configuration(self):
        output = Path(self.directory.name) / "device.env"
        output.write_text("HIKVISION_RTSP_URL=rtsp://camera\nROADSAFE_DEVICE_ID=old\n")
        original_post = self.module.requests.post
        self.module.requests.post = lambda *args, **kwargs: FakeResponse({"apiBaseUrl": "https://portal.example", "deviceId": "device-id", "deviceSecret": "device-secret"})
        try:
            self.module.activate("https://portal.example", "activation-token", output)
        finally:
            self.module.requests.post = original_post
        contents = output.read_text()
        self.assertIn("HIKVISION_RTSP_URL=rtsp://camera", contents)
        self.assertIn("ROADSAFE_DEVICE_ID=device-id", contents)
        self.assertEqual(contents.count("ROADSAFE_DEVICE_ID="), 1)


if __name__ == "__main__":
    unittest.main()

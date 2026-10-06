"""Offline permission regression checks; no APK, SDK or signing keys required."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("apk_audit", Path(__file__).parents[1] / "audit-apk.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class PermissionTests(unittest.TestCase):
    def test_optimized_security_resource_paths_are_resolved_exactly(self):
        resources = (
            "resource 0x7f140002 xml/bokji_network_security\n"
            "  () (file) res/n-.xml type=XML\n"
            "resource 0x7f140003 xml/other\n"
            "  () (file) res/other.xml type=XML\n"
        )
        self.assertEqual(audit.xml_resource_path(resources, "bokji_network_security",
                                                {"res/n-.xml"}), "res/n-.xml")
        with self.assertRaises(ValueError):
            audit.xml_resource_path(resources, "missing", {"res/other.xml"})
        with self.assertRaises(ValueError):
            audit.xml_resource_path(resources, "bokji_network_security", set())

    def test_unverified_variant_resources_are_rejected(self):
        resources = (
            "resource 0x7f140002 xml/bokji_network_security\n"
            "  () (file) res/n-.xml type=XML\n"
            "  (v24) (file) res/other.xml type=XML\n"
        )
        with self.assertRaises(ValueError):
            audit.xml_resource_path(resources, "bokji_network_security",
                                    {"res/n-.xml", "res/other.xml"})

    def test_fcm_receiver_requires_its_exact_permission(self):
        attrs = {"name": "com.google.firebase.iid.FirebaseInstanceIdReceiver"}
        self.assertFalse(audit.approved_component("receiver", attrs, "com.bokjicompass.app"))
        attrs["permission"] = "com.google.android.c2dm.permission.SEND"
        self.assertTrue(audit.approved_component("receiver", attrs, "com.bokjicompass.app"))
        attrs["permission"] = "android.permission.INTERNET"
        self.assertFalse(audit.approved_component("receiver", attrs, "com.bokjicompass.app"))

    def test_unrelated_exported_components_are_rejected(self):
        attrs = {"name": "com.other.Receiver", "permission": "com.google.android.c2dm.permission.SEND"}
        self.assertFalse(audit.approved_component("receiver", attrs, "com.bokjicompass.app"))
        self.assertFalse(audit.approved_component("service", attrs, "com.bokjicompass.app"))

    def test_notification_permissions_are_accepted(self):
        self.assertTrue({
            "android.permission.POST_NOTIFICATIONS",
            "android.permission.RECEIVE_BOOT_COMPLETED",
            "android.permission.WAKE_LOCK",
            "com.google.android.c2dm.permission.RECEIVE",
        } <= audit.allowed_permissions("com.bokjicompass.app"))

    def test_unrelated_permissions_and_other_app_receivers_are_rejected(self):
        allowed = audit.allowed_permissions("com.bokjicompass.app")
        for permission in (
            "android.permission.READ_EXTERNAL_STORAGE",
            "android.permission.SYSTEM_ALERT_WINDOW",
            "android.permission.USE_BIOMETRIC",
            "android.permission.CAMERA",
            "com.other.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION",
        ):
            self.assertNotIn(permission, allowed)


if __name__ == "__main__":
    unittest.main()

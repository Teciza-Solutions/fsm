import frappe
from frappe.model.document import Document


class FSMSettings(Document):
	pass


@frappe.whitelist()
def get_rf003_default_action_taken_template():
	if not frappe.has_permission("Preventive Maintenance", "read"):
		frappe.throw(frappe._("You do not have permission to read Preventive Maintenance."), frappe.PermissionError)

	return frappe.db.get_single_value("FSM Settings", "rf003_default_action_taken_template")

import frappe
from frappe.desk.form.assign_to import add


def reassign_tasks(reference_doctype, reference_name, task_link_field):
	if not reference_name:
		return

	users = frappe.get_all("Team Member", {"parenttype": reference_doctype, "parent": reference_name}, pluck="user_id")
	if not users:
		return

	tasks = frappe.get_all("Task", {task_link_field: reference_name}, ["name", "status", "description", "subject"])
	for task in tasks:
		if task.status == "Completed":
			continue
		frappe.db.delete("ToDo", {"reference_type": "Task", "reference_name": task.name})
		add({
			"assign_to": users,
			"doctype": "Task",
			"name": task.name,
			"description": task.description or task.subject,
		})

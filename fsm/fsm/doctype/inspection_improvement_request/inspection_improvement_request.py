# Copyright (c) 2025, Niyaz Razak and contributors
# For license information, please see license.txt

import re
import frappe
from frappe.model.document import Document
from frappe.model.naming import _format_autoname
from frappe import _
from frappe.utils import format_date
from frappe.desk.form.assign_to import add

from fsm.api.task_assignments import reassign_tasks


class InspectionImprovementRequest(Document):
	def autoname(self):
		original_team = self.team
		self.team = re.sub(r"[^\w\-\s/.]", "", self.team or "")
		try:
			self.name = _format_autoname(self.meta.autoname, self)
		finally:
			self.team = original_team

	def after_insert(self):
		"""
			When data importing this file, the child table not getting updated even after inserted.
			I think there is a bug in data import in insert record function: data_import/importer.py line 271
			there is only doc.insert() added not doc.save(), so when saving the tables are getting updated.
		"""
		self.save()

	def validate(self):
		# to avoid the naming issue if data imported
		if "00:00:00" in self.name and self.is_new():
			name = self.name.replace(" 00:00:00", "")
			self.name = name

		self.validate_inspection()

		if not self.units and not self.description:
			frappe.throw("Add Description if there are no Asset Units!")

	def on_submit(self):
		self.create_tasks()

	def validate_inspection(self):
		return
		if not self.units:
			return
		
		units = []
		for unit in self.units:
			units.append(unit.asset_unit)

		ins = frappe.qb.DocType("Inspection Improvement Request")
		un = frappe.qb.DocType("Schedule Cabinet Item")
		exists = (
			frappe.qb.from_(ins)
			.inner_join(un).on(ins.name == un.parent)
			.select(
				ins.name,
				ins.posting_date,
				un.asset_unit,
			)
			.where(
				(un.asset_unit.isin(units)) &
				(ins.team == self.team) &
				(ins.posting_date == self.posting_date) &
				(ins.docstatus < 2) &
				(ins.name != self.name)
			)
			.run(as_list=1)
		)
		if exists:
			frappe.throw(
				_(
					"Asset Unit {0} is already requested for Inpection for the Team on {1} <br> Reference: {2}"
					.format(
						frappe.bold(exists[0][2]),
						format_date(exists[0][1]),
						frappe.bold(frappe.get_desk_link("Inspection Improvement Request", exists[0][0]))
					)
				)
			)
	
	def create_tasks(self):
		team_members = []
		for row in self.team_members:
			team_members.append(row.user_id)

		for row in self.units:
			task = frappe.get_doc(
				{
					"doctype": "Task",
					"subject": "INS-" + row.asset_name + " : " + self.team,
					"project": row.project,
					"description": row.asset_name,
					"ins_imp_request": self.name,
					"asset_unit": row.asset_unit,
					"team": self.team,
					"type_of_work": row.type_of_work,
					"type": "INS",
					"status": "Open",
					"posting_date": self.posting_date,
				}
			)
			task.db_set("project", row.project)
			task.insert(ignore_permissions=True)

			self.assign_task_to_users(task, team_members)

		if not self.units:
			task = frappe.get_doc(
				{
					"doctype": "Task",
					"subject": "INS-" + self.description + " : " + self.team,
					# "project": row.project,
					"description": self.description,
					"request_description": self.description,
					"ins_imp_request": self.name,
					# "asset_unit": row.asset_unit,
					"team": self.team,
					"type": "INS",
					"status": "Open",
					"posting_date": self.posting_date,
				}
			)
			# task.db_set("project", row.project)
			task.insert(ignore_permissions=True)

			self.assign_task_to_users(task, team_members)
		
		
	def assign_task_to_users(self, task, users):
		args = {
			"assign_to": users,
			"doctype": task.doctype,
			"name": task.name,
			"description": task.description or task.subject,
		}
		add(args)

	@frappe.whitelist()
	def add_team_members(self):
		if not self.team:
			return
		
		team_members = frappe.db.get_all(
			"Team Member", 
			{"parent": self.team}, 
			["member", "user_id", "engineer_in_charge"]
		)

		exis_members = []
		for row in self.team_members:
			exis_members.append(row.member)

		for member in team_members:
			if member not in exis_members:
				self.append("team_members", {
					"member": member.member,
					"user_id": member.user_id,
					"engineer_in_charge": member.engineer_in_charge
				})

	@frappe.whitelist()
	def change_team(self, team, bulk=False):
		"""
		This function used to change the assigned team of a request
		"""

		if self.team == team and not bulk:
			frappe.throw("Cannot select same Team!")

		tasks = frappe.db.get_all(
			'Task', 
			{"ins_imp_request": self.name}, 
			["status", "name", "description", "subject", "asset_name"]
		)

		# Get new team members
		members = frappe.db.get_all(
			"Team Member",
			{"parenttype": "Team", "parent": team},
			["member", "member_name", "user_id", "engineer_in_charge"]
		)
		users = []

		self.db_set("team", team)
		self.team_members = []
		for member in members:
			self.append("team_members", {
				"member": member.member,
				"user_id": member.user_id,
				"engineer_in_charge": member.engineer_in_charge
			})
			users.append(member.user_id)

		self.flags.ignore_validate = True
		self.flags.ignore_validate_update_after_submit = True
		self.flags.ignore_on_update = True
		self.save(ignore_permissions=True)

		for task in tasks:
			if task.status == "Completed":
				continue

			frappe.db.delete("ToDo", {"reference_type": "Task", "reference_name": task.name})
			frappe.db.set_value("Task", task.name, { "team":team, "subject": "INS-" + task.asset_name + " : " + team })

			# Assign new users to the Task
			args = {
				"assign_to": users,
				"doctype": "Task",
				"name": task.name,
				"description": task.description or task.subject,
			}
			add(args)


@frappe.whitelist(methods=["POST"])
def reassign_bulkly(requests):
	requests = frappe.parse_json(requests)
	if not isinstance(requests, list) or not requests:
		frappe.throw(_("Select at least one inspection request."))
	for request in requests:
		if not frappe.has_permission("Inspection Improvement Request", "write", doc=request):
			frappe.throw(_("You do not have permission to reassign this request."), frappe.PermissionError)

	frappe.enqueue(reassign_request_tasks, requests=requests, queue="default")


def reassign_request_tasks(requests):
	for request in requests:
		reassign_tasks("Inspection Improvement Request", request, "ins_imp_request")

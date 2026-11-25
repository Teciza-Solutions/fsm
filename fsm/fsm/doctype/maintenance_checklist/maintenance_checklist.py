# Copyright (c) 2025, Niyaz Razak and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class MaintenanceChecklist(Document):
	@frappe.whitelist()
	def fetch_template(self, templates):
		self.set("main_activities", [])
		self.set("sub_activities", [])
		for template in templates:
			if not template:
				continue

			activities = frappe.db.get_all(
				"Maintenance Checklist Template Activity",
				{"parent": template},
				pluck="activity",
				order_by="idx"
			)

			self.append("main_activities", {
				"activity": template,
				"divider": 1                  # to highlight
			})

			for act in activities:
				self.append("main_activities", {
					"activity": act,
					"template": template,
				})

				sub_activities = frappe.db.get_all(
					"Maintenance Checklist Template Sub Activity",
					{"parent": act, "parenttype": "Maintenance Checklist Activity"},
					["activity", "check", "comments"],
					order_by="idx",
				)

				for sub_act in sub_activities:
					self.append("sub_activities", {
						"activity": sub_act.activity,
						"parent_activity": act,
						"check": sub_act.check,
						"comments": sub_act.comments,
					})

	# for projects - 2025-CSS-105, 2021-CSS-074, 2021-CSS-205 which are cp23, 3parks, falcon eye
	@frappe.whitelist()
	def fetch_template_for_maintenance(self):
		if not self.checklist_template:
			return
		
		items = frappe.db.get_all(
			"Maintenance Checklist Template Item", 
			filters={"parent": self.checklist_template, "parenttype": "Maintenance Checklist Template"}, 
			fields="*",
			order_by="idx"
		)
		for row in items:
			if row.has_comments:
				self.append("criterias", {
					"criteria": row.description,
					"has_comments": row.has_comments,
					"parent1": row.parent1,
				})

		columns = frappe.db.get_all(
			"Maintenance Checklist Template Item Column", 
			{"parent": self.checklist_template}, 
			["column_name", "field_type", "rotate", "not_input_field", "print_width"],
			order_by="idx"
		)
		for column in columns:
			self.append("columns", {
				"column_name": column.column_name, 
				"field_type": column.field_type, 
				"rotate": column.rotate, 
				"not_input_field": column.not_input_field,
				"print_width": column.print_width,
			})
			
			for desc in items:
				if not column.not_input_field:
					self.append("values", {
						"description": desc.get("description"),
						"column": column.column_name,
						"column_field_type": column.field_type,
						"parent1": desc.parent1,
						"main_parent": desc.main_parent,
						"has_comments": desc.has_comments,
						"value": self.get_default_value(column.column_name, desc),
					})

	def get_default_value(self, column_name, row):
		if self.project != "2021-CSS-205" or not row.parent1 or row.has_comments:
			return None

		return {"Yes": "1", "Remarks": "Done"}.get(column_name)
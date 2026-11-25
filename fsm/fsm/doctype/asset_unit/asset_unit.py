# Copyright (c) 2025, Niyaz Razak and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from pyproj import Transformer


class AssetUnit(Document):
	def validate(self):
		self.convert_coordinates()

	@frappe.whitelist()
	def convert_coordinates(self):
		if self.x_coordinate and self.y_coordinate:
			# Define the transformation from EPSG:2932 (Qatar National Grid) to EPSG:4326 (WGS 84)
			transformer = Transformer.from_crs("EPSG:2932", "EPSG:4326", always_xy=True)
			
			# Convert coordinates
			longitude, latitude = transformer.transform(float(self.x_coordinate), float(self.y_coordinate))
			
			self.longitude = longitude
			self.latitude = latitude

	@frappe.whitelist()
	def create_inspection_request(self):
		new_insp = frappe.new_doc("Inspection Improvement Request")
		new_insp.append("units", {
			"asset_unit": self.name,
			"asset_name": self.asset_name,
			"asset_id": self.asset_id,
			"asset_id": self.asset_id,
			"project": self.project,
		})
		return new_insp.as_dict()

	@frappe.whitelist()
	def sync_tasks(self):
		tasks = frappe.db.get_all("Task", 
			{"asset_unit": self.name, "status": ["!=", "Completed"]}, 
			pluck="name"
		)
		for task in tasks:
			task_doc = frappe.get_doc("Task", task)
			task_doc.save()

		return True

	@frappe.whitelist()
	def create_multi_checklist(self, templates):
		if isinstance(templates, str):
			templates = frappe.parse_json(templates)

		if not templates:
			frappe.throw(_("Please select at least one Checklist Template"))

		# Deduplicate while preserving selection order
		seen = set()
		unique_templates = []
		for t in templates:
			if t and t not in seen:
				seen.add(t)
				unique_templates.append(t)

		new_checklist = frappe.new_doc("Multi Checklist")
		new_checklist.asset_unit = self.name
		new_checklist.asset_name = self.asset_name
		new_checklist.project = self.project
		if not new_checklist.project and frappe.db.exists("Project", "2021-CSS-205"):
			new_checklist.project = "2021-CSS-205"
		new_checklist.location = getattr(self, "cp23b2_location", None) or getattr(self, "location_description", None)
		new_checklist.date = frappe.utils.today()

		for template in unique_templates:
			new_checklist.append("checklist_templates", {
				"template": template
			})

			items = frappe.db.get_all(
				"Maintenance Checklist Template Item", 
				filters={"parent": template, "parenttype": "Maintenance Checklist Template"}, 
				fields="*",
				order_by="idx"
			)

			has_comments_items = [r for r in items if r.get("has_comments")]
			target_criteria_items = has_comments_items if has_comments_items else items

			for row in target_criteria_items:
				new_checklist.append("criterias", {
					"criteria": row.get("description"),
					"has_comment": row.get("has_comments", 0),
					"has_comments": row.get("has_comments", 0),
					"parent1": row.get("parent1"),
					"checklist_template": template,
				})

			columns = frappe.db.get_all(
				"Maintenance Checklist Template Item Column", 
				{"parent": template}, 
				["column_name", "field_type", "rotate", "not_input_field", "print_width"],
				order_by="idx"
			)

			for column in columns:
				new_checklist.append("columns", {
					"column_name": column.get("column_name"), 
					"field_type": column.get("field_type"), 
					"rotate": column.get("rotate", 0), 
					"not_input_field": column.get("not_input_field", 0),
					"print_width": column.get("print_width"),
					"checklist_template": template,
				})
				
				for desc in items:
					if not column.get("not_input_field"):
						new_checklist.append("values", {
							"description": desc.get("description"),
							"column": column.get("column_name"),
							"column_field_type": column.get("field_type"),
							"parent1": desc.get("parent1"),
							"main_parent": desc.get("main_parent"),
							"has_comments": desc.get("has_comments", 0),
						"value": self.get_checklist_default_value(column.get("column_name"), desc, new_checklist.project),
							"checklist_template": template,
						})

		return new_checklist.as_dict()

	def get_checklist_default_value(self, column_name, desc, project):
		if project != "2021-CSS-205" or not desc.get("parent1") or desc.get("has_comments"):
			return None

		return {"Yes": "1", "Remarks": "Done"}.get(column_name)


@frappe.whitelist()
def bulk_schedule_asset_unit(asset_units, team, schedule_date, schedule_month, fiscal_year):
	asset_units = frappe.parse_json(asset_units)
	sc = frappe.get_doc(
		{
			"doctype": "Schedule Cabinet",
			"date": schedule_date,
			"team": team,
			"month": schedule_month,
			"fiscal_year": fiscal_year,
		}
	)
	for unit in asset_units:
		sc.append("asset_units",
			{
				"asset_unit": unit
			}
		)

	team_members = frappe.db.get_all(
		"Team Member", 
		{"parent": team}, 
		["member", "user_id", "engineer_in_charge"]
	)
	for member in team_members:
		sc.append("team_members", {
			"member": member.member,
			"user_id": member.user_id,
			"engineer_in_charge": member.engineer_in_charge
		})

	sc.insert(ignore_permissions=True)
	sc.submit()

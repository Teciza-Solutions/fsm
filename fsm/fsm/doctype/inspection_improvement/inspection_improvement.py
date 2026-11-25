# Copyright (c) 2025, Niyaz Razak and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import cint, today, get_datetime, flt
from frappe.model.document import Document
from frappe.model.naming import make_autoname
from frappe import _
import base64
import json
import zipfile
from frappe.utils.pdf import get_pdf
from io import BytesIO
from frappe.utils.file_manager import get_file_path
from fsm.api.task_assignments import reassign_tasks


class InspectionImprovement(Document):
	def autoname(self):
		if self.replacement:
			self.name = make_autoname(f"REPL-{self.project}-RFI-.####")
		else:
			if self.project:
				self.name = make_autoname(f"{self.project}-RFI-.####")
			else:
				self.name = make_autoname(f"RFI-.####")

	def validate(self):
		self.vaidate_attachments()
		self.add_team_members()
		self.calculate_boq_totals()

	def on_update_after_submit(self):
		self.calculate_boq_totals()

	def vaidate_attachments(self):
		if len(self.before) > 4 or len(self.during) > 4 or len(self.after) > 4:
			frappe.throw("Cannot Attach more than 4 Images, remove the last added row!")

		for row in self.activity_one:
			file = frappe.db.get_value("File", {"file_url": row.attachment, "attached_to_name": ["=", ""]}, "name")
			if file:
				frappe.db.set_value("File", file, {"attached_to_name": self.name, "attached_to_doctype": self.doctype})

		for row in self.activity_two:
			file = frappe.db.get_value("File", {"file_url": row.attachment, "attached_to_name": ["=", ""]}, "name")
			if file:
				frappe.db.set_value("File", file, {"attached_to_name": self.name, "attached_to_doctype": self.doctype})
	
	@frappe.whitelist()
	def replace_existing_file(self, file_url, filedata_base64):
		"""Replace an existing file's content with new base64 file"""
		# Find the File doc
		file_doc = frappe.db.get_value("File", {"file_url": file_url}, "file_url")
		if not file_doc:
			frappe.throw(f"File not found: {file_url}")

		# Decode base64
		file_path = get_file_path(file_url)
		file_content = base64.b64decode(filedata_base64)

		# Overwrite the file
		with open(file_path, 'wb') as f:
			f.write(file_content)

		return {"file_url": file_doc}

	@frappe.whitelist()
	def create_checklist(self):
		new_checklist = frappe.new_doc("Maintenance Checklist")
		new_checklist.inspection_improvement = self.name
		new_checklist.team = self.team
		new_checklist.project = self.project

		templates = frappe.db.get_all(
			"Asset Unit Checklist Template", 
			{"parent": self.asset_unit}, 
			pluck="template", 
			order_by="idx"
		)
		new_checklist.fetch_template(templates)

		return new_checklist.as_dict()

	def calculate_boq_totals(self):
		self.total_amount = self.total_qty = 0
		for row in self.boq_items:
			row.amount = flt(row.qty) * flt(row.rate)
			self.total_amount += row.amount
			self.total_qty += row.qty

	@frappe.whitelist()
	def add_reference_documents(self):
		if not self.document_template:
			return
		
		documents = frappe.db.get_all("Inspection Improvement Documents", 
			{
				"parenttype": "Inspection Improvement Document Template", 
				"parent": self.document_template
			},
			["document", "comment"]
		)

		self.documents = []
		for row in documents:
			self.append("documents", row)

	def add_team_members(self):
		if not self.team:
			return

		team_members = frappe.db.get_all(
			"Team Member", 
			{"parent": self.team}, 
			["member", "user_id", "member_name", "engineer_in_charge"]
		)
		
		exis_members = []
		for row in self.team_members:
			exis_members.append(row.member)
		
		for member in team_members:
			if member.member not in exis_members:
				self.append("team_members", {
					"member": member.member,
					"member_name": member.member_name,
					"user_id": member.user_id,
					"engineer_in_charge": member.engineer_in_charge
				})

	@frappe.whitelist()
	def update_asset_unit(self, asset_unit):
		self.asset_unit = asset_unit
		
		for task in self.tasks:
			task_ = frappe.get_doc("Task", task.task)
			task_.asset_unit = asset_unit
			task_.save()
		
		self.save()

		# after updating the asset unit, assign the todo and notify
		reassign_tasks("Inspection Improvement Request", self.ins_imp_request, "ins_imp_request")

		return True


@frappe.whitelist()
def get_item_price(item_code, buying=False):
	price_type = "buying" if cint(buying) else "selling"
	return frappe.db.get_value(
		"Item Price", {"item_code": item_code, price_type: 1}, "price_list_rate", order_by="valid_from desc"
	) or 0


def update_inspection_improvement(task, status):
	status = "Work Completed" if status == "Completed" else status
	filters = {
		"ins_imp_request": task.ins_imp_request, 
		"asset_unit": task.asset_unit, 
		"replacement": 1 if task.supervisor else 0,
		"docstatus": ["<", 2],
		# "date": task.posting_date,
	}
	if not task.asset_unit:
		filters = {
			"ins_imp_request": task.ins_imp_request, 
			"request_description": task.request_description, 
			"replacement": 1 if task.supervisor else 0,
			"docstatus": ["<", 2],
		}

	existing_ins = frappe.db.get_value(
		"Inspection Improvement", 
		filters,
		["name", "docstatus", "team"],
		as_dict=1
	)

	task_filter = {"ins_imp_request": task.ins_imp_request, "asset_unit": task.asset_unit, "team": task.team}
	if not task.asset_unit:
		task_filter.pop("asset_unit")
	
	if existing_ins and existing_ins.docstatus == 1:
		tasks = frappe.db.get_all(
			"Task", 
			task_filter, 
			["name", "total_time_taken"]
		)
		total_time = 0
		for task_ in tasks:
			total_time += flt(task_.total_time_taken)

		frappe.db.set_value("Inspection Improvement", existing_ins.name, {
				"total_time_taken": total_time,
				"status": status,
				"completed_date": task.completed_on,
			}
		)

		frappe.db.set_value("Preventive Maintenance Task", 
			{
				"task": task.name, "parenttype": "Inspection Improvement", "parent": existing_ins.name
			}, 
			{
				"status": status,
			}
		)

		return

	if existing_ins:
		ins = frappe.get_doc("Inspection Improvement", existing_ins.name)
		ins.status = status

		# add team members
		if ins.team != task.team:
			ins.team = task.team
			ins.team_members = []
			team_members = frappe.db.get_all(
				"Team Member",
				{"parenttype": "Team", "parent": task.team},
				["member", "engineer_in_charge"]
			)
			for mem in team_members:
				ins.append("team_members", {
					"member": mem.member,
					"engineer_in_charge": mem.engineer_in_charge,
				})

		# add tasks
		ins.tasks = []
		tasks = frappe.db.get_all(
			"Task", 
			task_filter, 
			["name", "total_time_taken"]
		)

		total_time = 0
		for task_ in tasks:
			ins.append("tasks", {
				"task": task_.name
			})
			total_time += flt(task_.total_time_taken)

		ins.total_time_taken = total_time

		if status == "Work Completed":
			ins.end_time = get_datetime()

		if task.completed_on:
			ins.completed_date = task.completed_on

		ins.save()
	else:
		type_of_work = frappe.db.get_value(
			"Inspection Request Asset Unit", 
			{
				"parenttype": "Inspection Improvement Request",
				"parent": task.ins_imp_request,
				"asset_unit": task.asset_unit,
			},
			"type_of_work"
		) if task.asset_unit else ""
		ins = frappe.get_doc({
			"doctype": "Inspection Improvement",
			"date": today(),
			"ins_imp_request": task.ins_imp_request,
			"asset_unit": task.asset_unit or "",
			"request_description": task.request_description,
			"start_time": get_datetime(),
			"type_of_work": type_of_work,
			"end_time": "",
			"total_time_taken": "",
			"status": status,
			"replacement": 1 if task.supervisor else 0,
			"team": task.team,
		})

		team_members = frappe.db.get_all(
			"Team Member", 
			{"parent": task.ins_imp_request, "parenttype": "Inspection Improvement Request"}, 
			["member", "engineer_in_charge"]
		)

		if ins.replacement:
			team_members = frappe.db.get_all(
				"Team Member",
				{"parenttype": "Team", "parent": task.team},
				["member", "engineer_in_charge"]
			)

		for mem in team_members:
			ins.append("team_members", {
				"member": mem.member,
				"engineer_in_charge": mem.engineer_in_charge,
			})

		tasks = frappe.db.get_all(
			"Task", 
			task_filter, 
			pluck="name"
		)
		for task in tasks:
			ins.append("tasks", {
				"task": task
			})

		ins.insert(ignore_permissions=True)
		ins.save()


@frappe.whitelist()
def download_reports(reports):
    if isinstance(reports, str):
        reports = json.loads(reports)

    if not reports:
        frappe.throw(_("No reports selected."))

    buffer = BytesIO()

    with zipfile.ZipFile(buffer, "w") as zipf:
        for name in reports:


            doc = frappe.get_doc("Inspection Improvement", name)

            # Render PDF using the custom print format
            pdf_html = frappe.get_print(
                "Inspection Improvement",
                doc.name,
                doc=doc,
                print_format="RFI Combined and Costing Sheet"
            )
			
            # Convert HTML → PDF
            pdf_data = get_pdf(pdf_html)

            # File Name logic (customize as needed)
            rfi_no = doc.get("rfi_no") or "RFI"

            file_name = f"{rfi_no}.pdf"
			
            # Add to ZIP
            zipf.writestr(file_name, pdf_data)

    buffer.seek(0)

    # Send the ZIP to browser
    frappe.local.response.filename = "RFI_Combine_Reports.zip"
    frappe.local.response.filecontent = buffer.getvalue()
    frappe.local.response.type = "binary"


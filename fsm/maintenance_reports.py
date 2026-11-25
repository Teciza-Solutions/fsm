from collections import defaultdict
from io import BytesIO
from pathlib import Path

import frappe
from frappe import _
from frappe.utils.file_manager import get_file_path
from PIL import Image
from pypdf import PdfWriter
from pypdf.errors import PyPdfError


@frappe.whitelist()
def download_pm_final_report(docname, print_format=None, doctype="Preventive Maintenance"):
	if doctype not in ("Preventive Maintenance", "Inspection Improvement"):
		frappe.throw(_("Unsupported report type."))
	doc = frappe.get_doc(doctype, docname)
	pdf = frappe.get_print(doc.doctype, doc.name, doc=doc, as_pdf=True, print_format=print_format)

	filename = doc.name
	if doc.asset_unit:
		asset = frappe.db.get_value("Asset Unit", doc.asset_unit, ["asset_id", "asset_name", "junction_no"])
		if asset:
			filename = "-".join(part for part in asset if part) or filename

	frappe.local.response.update(filename=f"{filename}.pdf", filecontent=pdf, type="pdf")


@frappe.whitelist()
def download_maintenance_files(names, doctype="Preventive Maintenance"):
	if doctype not in ("Preventive Maintenance", "Inspection Improvement Request"):
		frappe.throw(_("Unsupported attachment type."))
	names = frappe.parse_json(names)
	if not isinstance(names, list) or not names or any(not isinstance(name, str) or not name for name in names):
		frappe.throw(_("Select at least one record."))

	readable = frappe.get_list(
		doctype, filters={"name": ["in", names]}, pluck="name", limit_page_length=0
	)
	if set(readable) != set(names):
		frappe.throw(_("You do not have permission to download all selected records."), frappe.PermissionError)

	attachments = defaultdict(list)
	for row in frappe.get_all(
		"FSM Additional Attachment",
		filters={"parent": ["in", names], "parenttype": doctype},
		fields=["parent", "attach"],
		order_by="idx asc",
	):
		if row.attach:
			attachments[row.parent].append(row.attach)

	with PdfWriter() as pdf, BytesIO() as output:
		for name in names:
			for file_url in attachments[name]:
				_append_attachment(pdf, file_url)
		pdf.write(output)
		frappe.local.response.update(
			filename=f"{doctype.replace(' ', '_')}_attachments.pdf",
			filecontent=output.getvalue(),
			type="binary",
			charset="utf-8",
		)


def _append_attachment(pdf, file_url):
	try:
		file_path = get_file_path(file_url)
		if not file_path:
			return
		path = Path(file_path)
		extension = path.suffix.lower()
		if extension == ".pdf":
			pdf.append(path)
		elif extension in {".jpg", ".jpeg", ".png"}:
			with Image.open(path) as image, BytesIO() as buffer:
				image.convert("RGB").save(buffer, format="PDF")
				pdf.append(buffer)
	except (frappe.ValidationError, OSError, PyPdfError, ValueError, Image.DecompressionBombError):
		# Continue the download when one attachment is unavailable or unreadable.
		pass

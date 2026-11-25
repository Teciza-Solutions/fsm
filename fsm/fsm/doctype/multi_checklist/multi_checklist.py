# Copyright (c) 2026, Teciza Solutions and contributors
# For license information, please see license.txt

import base64
import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils.file_manager import get_file_path


class MultiChecklist(Document):
	@frappe.whitelist()
	def replace_existing_file(self, file_url, filedata_base64):
		"""Replace an existing file's content with new base64 file data (e.g. after rotation)"""
		file_doc = frappe.db.get_value("File", {"file_url": file_url}, "file_url")
		if not file_doc:
			frappe.throw(_("File not found: {0}").format(file_url))

		file_path = get_file_path(file_url)
		file_content = base64.b64decode(filedata_base64)

		with open(file_path, "wb") as f:
			f.write(file_content)

		return {"file_url": file_doc}

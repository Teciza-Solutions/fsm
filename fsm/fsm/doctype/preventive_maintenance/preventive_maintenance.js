// Copyright (c) 2025, Niyaz Razak and contributors
// For license information, please see license.txt

frappe.ui.form.on("Preventive Maintenance", {
	refresh(frm) {
		$(frm.wrapper).find('#rf003-dashboard-style').remove();

		frm.trigger("add_asset_unit_filter");
		frm.trigger("show_final_report_btn");

		if (!frm.doc.__islocal) {
			if (frm.doc.schedule_cabinet) {
				frm.add_custom_button(__('Checklist'), function () {
					if (!["2021-CSS-074", "2021-CSS-205", "2025-CSS-105"].includes(frm.doc.project) && !frm.doc.is_rf003_pm) {
						frappe.db.get_value("Maintenance Checklist", { "preventive_maintenance": frm.doc.name }, ["name"])
							.then(function (r) {
								if (!r.message.name) {
									frm.call({
										method: "create_checklist",
										doc: frm.doc,
										callback: function (res) {
											var doc = frappe.model.sync(res.message)
											frappe.set_route("Form", doc[0].doctype, doc[0].name);
										},
									});
								} else {
									frappe.set_route("Form", "Maintenance Checklist", r.message.name);
								}
							})
					} else {
						// for projects - 2025-CSS-105, 2021-CSS-074, 2021-CSS-205 which are cp23, 3parks, falcon eye
						frm.trigger("show_maintenance_checklist_option");
					}
				}, 'Create');
			} else if (frm.doc.is_rf003_pm) {
				frm.trigger("remove_all_custom_buttons");
				frm.trigger("show_rf003_checklist_option");
			} else {
				frm.trigger("show_rom_checklist_option");
			}
		}

		if (frm.doc.tasks.length > 0) {
			frm.add_custom_button('Tasks', function () {
				let task_names = frm.doc.tasks.map(row => row.task);
				frappe.set_route('List', 'Task', { name: ['in', task_names] });
			}, "View");
		}

		if (!frm.is_new()) {
			frm.trigger("show_image_download_option");
			frm.trigger("udate_asset_unit");
		} else {
			frm.set_value("ttg_personnel", frappe.session.user_fullname)
		}

		frm.trigger("show_fetch_geolocation_btn");
		frm.trigger("set_asset_location");

		if (frm.doc.is_rf003_pm) {
			frm.trigger("hide_fields_for_rf003_technician");
			frm.trigger("set_default_action_taken");
			frm.set_df_property("team", "read_only", 0)
		} else {
			frm.set_df_property("team", "read_only", 1)
		}

		if (sessionStorage.getItem('trigger_pm_report') === frm.doc.name) {
			sessionStorage.removeItem('trigger_pm_report');
			frm.trigger("generate_final_report");
		}
	},

	is_rf003_pm: function (frm) {
		if (frm.doc.is_rf003_pm) {
			frm.trigger("hide_fields_for_rf003_technician");
			frm.trigger("set_default_action_taken");
			frm.set_df_property("team", "read_only", 0)
		} else {
			frm.set_df_property("team", "read_only", 1)
		}
	},

	before_save: async function (frm) {
		if (frm.is_new()) {
			try {
				// await frm.trigger("fetch_geolocation_and_validate");
			} catch (e) {
				frappe.validated = false;
			}
		}
	},

	team: function (frm) {
		frm.call("add_team_members");
	},

	before_button: function (frm) {
		open_image_dialog("Before", "before", frm)
	},

	during_button: function (frm) {
		open_image_dialog("During", "during", frm)
	},

	after_button: function (frm) {
		open_image_dialog("After", "after", frm)
	},

	additional_button: function (frm) {
		open_image_dialog("Additional", "additional_image", frm)
	},

	upload_images: function (frm) {
		open_image_dialog("Images", "images", frm)
	},

	project: function (frm) {
		if (frm.doc.project && frm.doc.project == "2025-FM-153") {
			frm.set_value("is_rf003_pm", 1);
		} else {
			frm.set_value("is_rf003_pm", 0);
		}
	},

	asset_unit: function (frm) {
		// frm.trigger("fetch_geolocation_and_validate");
		if (frm.doc.is_rf003_pm) {
			frm.trigger("set_default_action_taken");
		}
	},

	asset_unit_type: function (frm) {
		frm.trigger("add_asset_unit_filter");
	},

	add_asset_unit_filter: function (frm) {
		if (frm.doc.asset_unit_type) {
			frm.set_query("asset_unit", function () {
				return {
					filters: {
						asset_type: frm.doc.asset_unit_type,
					},
				};
			});
		}
	},

	show_final_report_btn: function (frm) {
		if (!frm.doc.__islocal && frm.doc.after && frm.doc.during) {
			frm.add_custom_button(__("Final Report"), function () {
				frm.trigger("generate_final_report");
			});
		}
	},

	generate_final_report: function (frm) {
		let print_format = "PM Final Report";
		if (["2021-CSS-205"].includes(frm.doc.project)) {
			print_format = "PM Final Report for CP23";
		}
		if (["2021-CSS-074"].includes(frm.doc.project)) {
			print_format = "PM Final Report for 3Parks";
		}
		if (["2025-CSS-105"].includes(frm.doc.project)) {
			print_format = "PM Final Report for Falcon Eye";
		}
		if (frm.doc.is_rf003_pm) {
			print_format = "PM Final Report for RF003";
		}
		const params = new URLSearchParams({ docname: frm.doc.name, print_format });
		const download_url = `/api/method/fsm.maintenance_reports.download_pm_final_report?${params}`;

		// there maybe multiple chechlists so set the selected checklist in pm and generate report
		if (["2021-CSS-205", "2021-CSS-074", "2025-CSS-105"].includes(frm.doc.project)) {
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Maintenance Checklist",
					filters: {
						preventive_maintenance: frm.doc.name
					},
					fields: ["name"],
				},
				callback: function (r) {
					let checklists = r.message || [];

					if (checklists.length === 1) {
						frm.set_value("maintenance_checklist", checklists[0].name)
							.then(() => frm.save_or_update())
							.then(() => {
								setTimeout(() => {
								window.open(download_url);
								}, 1000);
							});

					} else if (checklists.length > 1) {
						let d = new frappe.ui.Dialog({
							title: "Select Maintenance Checklist",
							fields: [
								{
									label: "Maintenance Checklist",
									fieldname: "maintenance_checklist",
									fieldtype: "Link",
									options: "Maintenance Checklist",
									reqd: 1,
									get_query: function () {
										return {
											filters: {
												preventive_maintenance: frm.doc.name
											}
										};
									}
								}
							],
							primary_action_label: "Proceed",
							primary_action(values) {
								frm.dirty();

								frm.set_value("maintenance_checklist", values.maintenance_checklist)
									.then(() => frm.save_or_update())
									.then(() => {
										setTimeout(() => {
											window.open(download_url);
										}, 1000);
										d.hide();
									});
							}
						});

						d.show();

					} else {
						frappe.msgprint("No Maintenance Checklist found for this document.");
					}
				}
			});

		} else {
			window.open(download_url);

		}
	},

	remove_all_custom_buttons: async function (frm) {
		if (frappe.session.user === "Administrator" || frappe.user.has_role("System Manager")) return;

		const is_technician = frappe.user.has_role("RF003 Technician");
		if (is_technician) {
			frm.page.clear_menu();
		}
	},

	set_default_action_taken: async function (frm) {
		if (!frm.doc.asset_unit || frm.doc.checklist_created) {
			return;
		}
		const template = await frappe.xcall("fsm.fsm.doctype.fsm_settings.fsm_settings.get_rf003_default_action_taken_template");
		if (!template) {
			return;
		}

		// Fetch the complete Asset Unit document dynamically
		const asset_unit = await frappe.db.get_doc("Asset Unit", frm.doc.asset_unit);
		if (!asset_unit) {
			return;
		}

		const doc = { ...asset_unit, ...frm.doc };
		let rendered = template;
		const regex = /{{\s*([a-zA-Z0-9_-]+)\s*}}/g;
		let match;
		const replacements = {};

		while ((match = regex.exec(template)) !== null) {
			const placeholder = match[0];
			const tag = match[1];

			if (replacements[placeholder] !== undefined) {
				continue;
			}

			let value = "";
			const resolved_tag = tag;

			if (frm.doc[resolved_tag] !== undefined && frm.doc[resolved_tag] !== null) {
				value = frm.doc[resolved_tag];
			} else if (doc[resolved_tag] !== undefined && doc[resolved_tag] !== null) {
				value = doc[resolved_tag];
			} else if (frm.doc[tag] !== undefined && frm.doc[tag] !== null) {
				value = frm.doc[tag];
			} else if (doc[tag] !== undefined && doc[tag] !== null) {
				value = doc[tag];
			}

			replacements[placeholder] = value;
		}

		// Apply all replacements
		for (const [placeholder, value] of Object.entries(replacements)) {
			rendered = rendered.split(placeholder).join(value);
		}

		// Only set the value if it's a new document or if the field is empty
		if (frm.is_new() || !frm.doc.action_taken) {
			frm.set_value("action_taken", rendered);
		}
	},

	hide_fields_for_rf003_technician: async function (frm) {
		if (frappe.session.user === "Administrator" || frappe.user.has_role("System Manager")) return;

		const is_technician = frappe.user.has_role("RF003 Technician");
		frm.meta.fields.forEach(df => {
			if (df.fieldtype === "Section Break") {
				if (df.fieldname === "main_section") {
					frm.set_df_property(df.fieldname, "hidden", 0);
				} else {
					frm.set_df_property(df.fieldname, "hidden", is_technician ? 1 : 0);
				}
			}

			if (is_technician && df.fieldname !== "status") {
				frm.set_df_property(df.fieldname, "read_only", 1);
			}
		});
	},

	udate_asset_unit: function (frm) {
		if (frm.doc.asset_unit) return;

		frm.add_custom_button(__('Update Asset Unit'), function () {
			let d = new frappe.ui.Dialog({
				title: __("Update Asset Unit"),
				fields: [
					{
						label: 'Asset Unit',
						fieldname: 'asset_unit',
						fieldtype: 'Link',
						options: "Asset Unit",
						reqd: 1,
					},
				],
				primary_action_label: __("Update"),
				primary_action: async function (values) {
					frm.call({
						method: "update_asset_unit",
						doc: frm.doc,
						args: { asset_unit: values.asset_unit },
						callback: function (r) {
							if (r.message) {
								d.hide();
								frappe.msgprint("Asset Unit updated successfully.");
							}
						}
					});
				},
				secondary_action_label: __("Close"),
				secondary_action: () => d.hide(),
			});
			d.show();
		}, "Actions");
	},

	show_image_download_option: function (frm) {
		const is_technician = frappe.user.has_role("RF003 Technician") && frappe.session.user !== "Administrator";
		if (is_technician) return;

		frm.add_custom_button(__('Download Images'), () => {
			frappe.require([
				"https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
				"https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js"
			], () => {
				const sections = [
					{ label: "Before", fieldname: "before" },
					{ label: "During", fieldname: "during" },
					{ label: "After", fieldname: "after" },
					{ label: "Additional", fieldname: "additional_image" },
				];

				const wrapper_id = `download-img-${Math.random().toString(36).substring(2, 10)}`;
				let selectedImages = [];

				const buildSection = (label, images, sectionId) => {
					if (!images || !images.length) return '';
					return `
						<div style="margin-bottom: 24px;">
							<h4>${label}</h4>
							<div id="${sectionId}" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
								${images.map((img, i) => `
									<div style="border: 1px solid #ccc; padding: 8px; border-radius: 6px; position: relative; background: #f9f9f9;">
										<img src="${img.image}" 
											style="width: 100%; max-height: 300px; object-fit: contain; border-radius: 4px; margin-bottom: 8px;" 
											alt="Image ${i + 1}" />
										<label style="display: flex; align-items: center; gap: 6px;">
											<input type="checkbox" class="download-check" value="${img.image}" />
											Select
										</label>
										<a href="${img.image}" target="_blank" style="position: absolute; top: 8px; right: 10px; font-size: 12px;">Preview</a>
									</div>
								`).join('')}
							</div>
						</div>
					`;
				};

				const getHtml = () => {
					return sections.map(sec => buildSection(sec.label, frm.doc[sec.fieldname], `${wrapper_id}-${sec.fieldname}`)).join('');
				};

				const dialog = new frappe.ui.Dialog({
					title: "Download Images",
					fields: [
						{
							fieldtype: 'HTML',
							fieldname: 'image_selector',
							options: `<div id="${wrapper_id}" style="max-height: 70vh; overflow-y: auto;">${getHtml()}</div>`
						},
						{
							fieldtype: 'Section Break'
						},
						{
							fieldtype: 'Column Break'
						},
						{
							fieldtype: 'Check',
							label: 'Select All Images',
							fieldname: 'select_all_images',
							default: 0,
							onchange: function () {
								const checked = this.get_value();
								$(`#${wrapper_id} .download-check`).prop('checked', checked);
							}
						},
						{
							fieldtype: 'Column Break'
						},
						{
							fieldtype: 'Button',
							label: 'Download Selected Images',
							click: () => {
								const checks = $(`#${wrapper_id} .download-check:checked`);
								if (!checks.length) {
									frappe.msgprint("Please select at least one image to download.");
									return;
								}

								const urls_by_section = { Before: [], During: [], After: [], Additional: [] };

								[...checks].forEach(input => {
									const url = input.value;
									const parentDiv = $(input).closest('div[id^="' + wrapper_id + '-"]');
									const sectionId = parentDiv.attr('id') || '';
									if (sectionId.includes('before')) {
										urls_by_section.Before.push(url);
									} else if (sectionId.includes('during')) {
										urls_by_section.During.push(url);
									} else if (sectionId.includes('after')) {
										urls_by_section.After.push(url);
									}
									else if (sectionId.includes('additional_image')) {
										urls_by_section.Additional.push(url);
									}
								});

								downloadImagesAsZip(urls_by_section);
							}
						}
					],

					size: 'extra-large'
				});

				dialog.show();

				function downloadImagesAsZip(urls_by_section) {
					const zip = new JSZip();

					let totalImages = 0;
					Object.keys(urls_by_section).forEach(section => {
						totalImages += urls_by_section[section].length;
					});

					let completed = 0;
					frappe.show_progress("Preparing download", 0, totalImages);

					const fetchPromises = [];

					Object.entries(urls_by_section).forEach(([section, urls]) => {
						const folder = zip.folder(section);  // Create folder per section
						urls.forEach(url => {
							const promise = fetch(url)
								.then(res => res.blob())
								.then(blob => {
									const originalName = getFileNameFromURL(url);
									folder.file(originalName, blob);
									completed++;
									frappe.show_progress("Preparing download", completed, totalImages);
								});
							fetchPromises.push(promise);
						});
					});

					Promise.all(fetchPromises).then(() => {
						const zipName = `images_${frm.doc.name}.zip`;
						zip.generateAsync({ type: "blob" }).then(content => {
							saveAs(content, zipName);
							frappe.hide_progress();
							dialog.hide();
						});
					});
				}

				function getFileNameFromURL(url) {
					const parts = url.split('/');
					return decodeURIComponent(parts[parts.length - 1].split('?')[0]);
				}
			});
		}, "Actions");
	},

	show_rom_checklist_option: function (frm) {
		if (frm.doc.schedule_cabinet) return;
		frm.add_custom_button(__('Checklist'), () => {
			let dialog = new frappe.ui.Dialog({
				title: __('Create Checklist - Click on Existing Templates'),
				fields: [
					{
						fieldname: 'templates',
						fieldtype: 'HTML',
					},
					{
						fieldname: 'checklist_master',
						label: __('Checklist'),
						fieldtype: 'Link',
						options: 'ROM Checklist Master',
						reqd: 1,
						hidden: 1,
						get_query: () => {
							return {
								filters: {
									rom_department: "ITS",
								}
							};
						}

					},
					{
						fieldname: 'checklist_type',
						label: __('Type'),
						fieldtype: 'Select',
						hidden: 1,
						options: [
							'Daily',
							'Weekly',
							'Monthly',
							'Quarterly',
							'Semi Annually',
							'Annually'
						],
						reqd: 1
					}
				],
				// primary_action_label: __('Create'),
				// primary_action(values) {
				// 	dialog.hide();
				// 	create_checklist(frm, values=values, checklist_template=null)
				// }
			});

			dialog.show();

			frm.call({
				method: "get_rom_checklist_tempalates",
				doc: frm.doc,
				callback(r) {
					const templates = r.message || [];
					const wrapper = dialog.fields_dict.templates.$wrapper;

					if (!templates.length) {
						wrapper.html(`<div class="text-muted">No templates available</div>`);
						return;
					}

					let html = `
						<div class="template-list">
							${templates.map(t => `
								<div class="template-item" data-template="${t}">
									<div class="template-text">
										<div class="template-title">${t}</div>
										<div class="template-subtitle">Click to create checklist</div>
									</div>
								</div>
							`).join("")}
						</div>

						<style>
							.template-list {
								display: grid;
								grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
								gap: 14px;
								margin-bottom: 15px;
							}

							.template-item {
								display: flex;
								align-items: center;
								gap: 12px;
								padding: 12px 14px;
								border: 1px solid #dfe4ea;
								border-radius: 10px;
								background: #ffffff;
								cursor: pointer;
								transition: all 0.2s ease;
								box-shadow: 0 1px 2px rgba(0,0,0,0.04);
							}

							.template-item:hover {
								background: #f0f7ff;
								border-color: #5c9ded;
								box-shadow: 0 4px 12px rgba(92,157,237,0.15);
								transform: translateY(-2px);
							}

							.template-item:active {
								transform: scale(0.98);
							}


							.template-text {
								display: flex;
								flex-direction: column;
							}

							.template-title {
								font-size: 14px;
								font-weight: 600;
								color: #2f3542;
								line-height: 1.2;
							}

							.template-subtitle {
								font-size: 11px;
								color: #8395a7;
								margin-top: 2px;
							}
						</style>
					`;
					wrapper.html(html);

					wrapper.find('.template-item').on('click', function () {
						const template = $(this).data('template');
						create_checklist(frm, values = {}, checklist_template = template)
					});
				}
			});

		}, __('Create'));
	},

	show_rf003_checklist_option: function (frm) {
		if (frm.doc.schedule_cabinet) return;
		if (!frm.doc.is_rf003_pm) return;

		if (!frm.doc.checklist_created) {
			frm.page.clear_primary_action();
		};

		$(frm.wrapper).find('.form-dashboard').show();
		if (!$(frm.wrapper).find('#rf003-dashboard-style').length) {
			$('<style id="rf003-dashboard-style">')
				.prop('type', 'text/css')
				.html(`
					.document-link:not([data-doctype="RF003 Checklist"]) {
						display: none !important;
					}
				`)
				.appendTo(frm.wrapper);
		}

		if (["Completed", "Working", "Approved"].includes(frm.doc.status)) {
			frm.trigger("show_final_report_btn");
		}

		if (["Completed", "Cancelled", "Approved"].includes(frm.doc.status)) {
			return;
		}

		frm.add_custom_button(__('Start Preventive'), () => {
			// let dialog = new frappe.ui.Dialog({
			// 	title: __('Create Checklist - Click on Existing Templates'),
			// 	fields: [
			// 		{
			// 			fieldname: 'templates',
			// 			fieldtype: 'HTML',
			// 		},
			// 	],
			// });

			// dialog.show();

			// frm.call({
			// 	method: "get_rf003_checklist_tempalates",
			// 	doc: frm.doc,
			// 	callback(r) {
			// 		const templates = r.message || [];
			// 		const wrapper = dialog.fields_dict.templates.$wrapper;

			// 		if (!templates.length) {
			// 			wrapper.html(`<div class="text-muted">No templates available for the Asset Unit Type</div>`);
			// 			return;
			// 		}

			// 		let html = `
			// 			<div class="template-list">
			// 				${templates.map(t => `
			// 					<div class="template-item" data-template="${t}">
			// 						<div class="template-text">
			// 							<div class="template-title">${t}</div>
			// 							<div class="template-subtitle">Click to create checklist</div>
			// 						</div>
			// 					</div>
			// 				`).join("")}
			// 			</div>

			// 			<style>
			// 				.template-list {
			// 					display: grid;
			// 					grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
			// 					gap: 14px;
			// 					margin-bottom: 15px;
			// 				}

			// 				.template-item {
			// 					display: flex;
			// 					align-items: center;
			// 					gap: 12px;
			// 					padding: 12px 14px;
			// 					border: 1px solid #dfe4ea;
			// 					border-radius: 10px;
			// 					background: #ffffff;
			// 					cursor: pointer;
			// 					transition: all 0.2s ease;
			// 					box-shadow: 0 1px 2px rgba(0,0,0,0.04);
			// 				}

			// 				.template-item:hover {
			// 					background: #f0f7ff;
			// 					border-color: #5c9ded;
			// 					box-shadow: 0 4px 12px rgba(92,157,237,0.15);
			// 					transform: translateY(-2px);
			// 				}

			// 				.template-item:active {
			// 					transform: scale(0.98);
			// 				}


			// 				.template-text {
			// 					display: flex;
			// 					flex-direction: column;
			// 				}

			// 				.template-title {
			// 					font-size: 14px;
			// 					font-weight: 600;
			// 					color: #2f3542;
			// 					line-height: 1.2;
			// 				}

			// 				.template-subtitle {
			// 					font-size: 11px;
			// 					color: #8395a7;
			// 					margin-top: 2px;
			// 				}
			// 			</style>
			// 		`;
			// 		wrapper.html(html);

			// 		wrapper.find('.template-item').on('click', function () {
			// 			const template = $(this).data('template');
			// 			create_rf003checklist(frm, values={}, checklist_template=template)
			// 		});
			// 	}
			// });
			create_rf003checklist(frm, values = {}, checklist_template = frm.doc.asset_unit_type)

		}).addClass("btn-primary");


	},

	show_maintenance_checklist_option: function (frm) {
		// frequency filter only for CP23B2 - its template names start with "Semi" or "Monthly"
		const show_frequency_filter = frm.doc.project === "2021-CSS-205";
		const get_frequency = (template) => {
			if (/^semi/i.test(template)) return "Semi Annual";
			if (/^monthly/i.test(template)) return "Monthly";
			return "";
		};

		let dialog;
		const apply_frequency_filter = () => {
			if (!dialog) return;
			const frequency = show_frequency_filter ? dialog.get_value("frequency") : "";
			dialog.fields_dict.templates.$wrapper.find('.template-item').each(function () {
				$(this).toggle(!frequency || $(this).data('frequency') === frequency);
			});
		};

		dialog = new frappe.ui.Dialog({
			title: __('Create Checklist - Click on Existing Templates'),
			fields: [
				{
					fieldname: 'frequency',
					fieldtype: 'Select',
					label: __('Frequency'),
					options: "Semi Annual\nMonthly",
					default: "Monthly",
					hidden: !show_frequency_filter,
					onchange: apply_frequency_filter,
				},
				{
					fieldname: 'templates',
					fieldtype: 'HTML',
				},

			],
		});

		dialog.show();

		frm.call({
			method: "get_maintenance_checklist_tempalates",
			doc: frm.doc,
			callback(r) {
				const templates = r.message || [];
				const wrapper = dialog.fields_dict.templates.$wrapper;

				if (!templates.length) {
					wrapper.html(`<div class="text-muted">No templates available</div>`);
					return;
				}

				let html = `
					<div class="template-list">
						${templates.map(t => `
							<div class="template-item" data-template="${t}" data-frequency="${get_frequency(t)}">
								<div class="template-text">
									<div class="template-title">${t}</div>
									<div class="template-subtitle">Click to create checklist</div>
								</div>
							</div>
						`).join("")}
					</div>

					<style>
						.template-list {
							display: grid;
							grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
							gap: 14px;
							margin-bottom: 15px;
						}

						.template-item {
							display: flex;
							align-items: center;
							gap: 12px;
							padding: 12px 14px;
							border: 1px solid #dfe4ea;
							border-radius: 10px;
							background: #ffffff;
							cursor: pointer;
							transition: all 0.2s ease;
							box-shadow: 0 1px 2px rgba(0,0,0,0.04);
						}

						.template-item:hover {
							background: #f0f7ff;
							border-color: #5c9ded;
							box-shadow: 0 4px 12px rgba(92,157,237,0.15);
							transform: translateY(-2px);
						}

						.template-item:active {
							transform: scale(0.98);
						}


						.template-text {
							display: flex;
							flex-direction: column;
						}

						.template-title {
							font-size: 14px;
							font-weight: 600;
							color: #2f3542;
							line-height: 1.2;
						}

						.template-subtitle {
							font-size: 11px;
							color: #8395a7;
							margin-top: 2px;
						}
					</style>
				`;
				wrapper.html(html);
				apply_frequency_filter();

				wrapper.find('.template-item').on('click', function () {
					const template = $(this).data('template');
					create_maintenance_checklist(frm, checklist_template = template)
				});
			}
		});
	},

	show_fetch_geolocation_btn: function (frm) {
		const is_technician = frappe.user.has_role("RF003 Technician") && frappe.session.user !== "Administrator";
		if (is_technician) return;

		frm.add_custom_button(__('Fetch Current Location'), function () {
			frm.trigger("fetch_geolocation_and_validate").then(() => {
				frm.save();
			});
		}, "Actions");
	},

	set_asset_location: function (frm) {
		if (frm.doc.latitude && frm.doc.longitude) {
			frm.set_df_property('actual_asset_location', 'options', `
			<iframe width=100% height="300" 
				id="gmap_canvas" 
				src="https://maps.google.com/maps?q=`+ frm.doc.latitude + `,` + frm.doc.longitude + `&t=&z=17&ie=UTF8&iwloc=&output=embed"
				frameborder="0" scrolling="no" marginheight="0" marginwidth="0">
			</iframe>`);
			frm.refresh_field('actual_asset_location');
		}

		if (frm.doc.current_latitude && frm.doc.current_longitude) {
			frm.set_df_property('current_location', 'options', `
			<iframe width=100% height="300" 
				id="gmap_canvas" 
				src="https://maps.google.com/maps?q=`+ frm.doc.current_latitude + `,` + frm.doc.current_longitude + `&t=&z=17&ie=UTF8&iwloc=&output=embed"
				frameborder="0" scrolling="no" marginheight="0" marginwidth="0">
			</iframe>`);
			frm.refresh_field('current_location');
		}


		if (frm.doc.location_status && !frm.is_new()) {
			frm.set_df_property('asset_unit', 'description',
				__(`<span style="color: ${frm.doc.location_status.includes("Location Match") || frm.doc.location_status.includes("Location Matched") ? "green" : "red"}; font-weight: bold;">${frm.doc.location_status}</span>`)
			);
			frm.refresh_field('asset_unit');
		}
	},

	fetch_geolocation_and_validate: function (frm) {
		if (frm.doc.checklist_created) {
			return;
		}
		return new Promise((resolve, reject) => {
			if (!navigator.geolocation) {
				frappe.msgprint({
					message: __("Geolocation is not supported by your current browser"),
					title: __("Geolocation Error"),
					indicator: "red",
				});
				return reject();
			}

			if (!frm.doc.latitude || !frm.doc.longitude) {
				frappe.msgprint({
					message: __("Asset location (Latitude/Longitude) is not set."),
					title: __("Validation Error"),
					indicator: "red",
				});
				return reject();
			}

			frappe.dom.freeze(__("Fetching your geolocation") + "...");

			navigator.geolocation.getCurrentPosition(
				async (position) => {
					const currentLat = position.coords.latitude;
					const currentLng = position.coords.longitude;

					frm.set_value('current_latitude', currentLat);
					frm.set_value('current_longitude', currentLng);
					frm.set_value('location_status', '');
					frappe.dom.unfreeze();

					const distance = get_distance_in_meters(
						parseFloat(frm.doc.latitude),
						parseFloat(frm.doc.longitude),
						currentLat,
						currentLng
					);

					const THRESHOLD_METERS = 30;

					if (distance > THRESHOLD_METERS) {
						frm.set_value('location_status', `❌ Location Mismatch (PM created when you were ${Math.round(distance)} meters away, max allowed is ${THRESHOLD_METERS} meters)`);
						frm.set_df_property('asset_unit', 'description',
							__('<span style="color: red; font-weight: bold;">❌ Location Mismatch ({0} meters away, max {1} meters)</span>',
								[Math.round(distance), THRESHOLD_METERS])
						);
						frm.trigger("set_asset_location");
						resolve();
					} else {
						frm.set_value("location_status", `✅ Location Match (PM created within the boundary: ${Math.round(distance)} meters)`);
						frm.set_df_property('asset_unit', 'description',
							__('<span style="color: green; font-weight: bold;">✅ Location Match ({0} meters away)</span>',
								[Math.round(distance)])
						);
						frm.trigger("set_asset_location");
						frappe.show_alert({ message: __("Location verified successfully"), indicator: "green" });
						resolve();
					}

					// frm.save();
					// frm.refresh();
				},
				(error) => {
					frappe.dom.unfreeze();
					let msg = __("Unable to retrieve your location") + "<br><br>";
					if (error) {
						msg += __("ERROR({0}): {1}", [error.code, error.message]);
					}
					frappe.throw({
						message: msg,
						title: __("Geolocation Error"),
						indicator: "red",
					});
					reject();
				},
				{
					enableHighAccuracy: true,
					timeout: 10000,
					maximumAge: 0
				}
			);
		});
	},
});

function get_distance_in_meters(lat1, lon1, lat2, lon2) {
	const R = 6371000; // Earth radius in meters
	const toRad = (val) => (val * Math.PI) / 180;

	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);

	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
		Math.sin(dLon / 2) * Math.sin(dLon / 2);

	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c; // distance in meters
}


function create_checklist(frm, values = {}, checklist_template = null) {
	let filters = { "pm": frm.doc.name, "checklist": values.checklist_master, "checklist_type": values.checklist_type };
	if (checklist_template) {
		filters = { "pm": frm.doc.name, "checklist_template": checklist_template };
	}
	frappe.db.get_value("ROM Checklist", filters, ["name"])
		.then(function (r) {
			if (!r.message.name) {
				frm.call({
					method: "create_rom_checklist",
					doc: frm.doc,
					args: {
						checklist_master: values.checklist_master,
						checklist_type: values.checklist_type,
						checklist_template: checklist_template,
					},
					callback(res) {
						if (res.message) {
							let doc = frappe.model.sync(res.message);
							frappe.set_route("Form", doc[0].doctype, doc[0].name);
						}
					}
				});
			} else {
				frappe.set_route("Form", "ROM Checklist", r.message.name);
			}
		})
}

function create_rf003checklist(frm, values = {}, checklist_template = null) {
	frm.trigger("fetch_geolocation_and_validate")
		.then(() => {
			if (frm.doc.location_status && frm.doc.location_status.includes("❌")) {
				frappe.show_alert({ message: __("Location mismatch."), indicator: "red" });
			}

			let filters = { "pm": frm.doc.name, "checklist_template": checklist_template };
			frappe.db.get_value("RF003 Checklist", filters, ["name"])
				.then(function (r) {
					if (!r.message.name) {
						frm.call({
							method: "create_rf003_checklist",
							doc: frm.doc,
							args: {
								checklist_template: checklist_template,
							},
							callback(res) {
								if (res.message) {
									let doc = frappe.model.sync(res.message);
									frappe.set_route("Form", doc[0].doctype, doc[0].name);
								}
							}
						});
					} else {
						frappe.set_route("Form", "RF003 Checklist", r.message.name);
					}
				});
		})
		.catch(err => {
			// handle reject (e.g. error retrieving geolocation)
		});
}


function create_maintenance_checklist(frm, checklist_template) {
	let filters = { "preventive_maintenance": frm.doc.name, "checklist_template": checklist_template };
	frappe.db.get_value("Maintenance Checklist", filters, ["name"])
		.then(function (r) {
			if (!r.message.name) {
				frm.call({
					method: "create_maintenance_checklist",
					doc: frm.doc,
					args: {
						template: checklist_template,
					},
					callback(res) {
						if (res.message) {
							let doc = frappe.model.sync(res.message);
							frappe.set_route("Form", doc[0].doctype, doc[0].name);
						}
					}
				});
			} else {
				frappe.set_route("Form", "Maintenance Checklist", r.message.name);
			}
		})
}


function open_image_dialog(section, fieldname, frm) {
	let dialog;

	let image_rows = (frm.doc[fieldname] || []).map(row => ({
		image: row.image,
	}));

	dialog = new frappe.ui.Dialog({
		title: `Attach ${section} Images`,
		fields: [
			{
				label: 'Images',
				fieldname: 'images',
				fieldtype: 'Table',
				cannot_add_rows: true,
				in_place_edit: false,
				fields: [
					{
						fieldtype: 'Attach Image',
						fieldname: 'image',
						label: 'Image',
						reqd: 1,
						in_list_view: 1
					},
				]
			},
			{
				fieldtype: 'Section Break',
				fieldname: 'section_brk',
			},
			{
				fieldtype: 'Button',
				label: 'Upload Images',
				fieldname: 'upload_images',
				click: () => {
					// image limit change from 4 to 10 04-11-26
					const remaining = 10 - image_rows.length;
					// added condition for additional_image field to allow more than 4 images
					// added condition for is_rf003_pm field to allow more than 4 images
					// added condition for CP23-B2 2021-CSS-205 to allow more than 4 images
					if (remaining <= 0 && fieldname !== "additional_image" && !frm.doc.is_rf003_pm && frm.doc.project !== "2021-CSS-205") {
						frappe.msgprint(`You can only upload up to 10 images for ${section}.`);
						return;
					}

					new frappe.ui.FileUploader({
						allow_multiple: true,
						max_count: remaining,
						on_success(file) {
							image_rows.push({
								image: file.file_url,
								caption: file.name
							});
							dialog.set_value('images', image_rows);
							dialog.fields_dict.images.df.data = image_rows;
							dialog.fields_dict.images.grid.refresh();

							if (image_rows.length > 10 && fieldname !== "additional_image" && !frm.doc.is_rf003_pm && frm.doc.project !== "2021-CSS-205") {
								frappe.throw(`${section} image limit reached (10).`);
								return;
							}
						}
					});
				}
			},
			{
				fieldtype: 'Column Break',
				fieldname: 'column_brk',
			},
			{
				fieldtype: 'Button',
				label: 'View Images',
				fieldname: 'view_images',
				click: () => {
					if (!image_rows.length) {
						frappe.msgprint('No images uploaded yet.');
						return;
					}

					const wrapper_id = `img-dialog-${Math.random().toString(36).substring(2, 10)}`;
					const wrapper = $(`
						<div id="${wrapper_id}" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; padding: 12px; max-height: 80vh; overflow-y: auto;">
							${image_rows.map((img, index) => `
								<div style="position: relative; border: 1px solid #ccc; padding: 8px; border-radius: 6px; background: #fff;">
									<img 
										src="${img.image}" 
										style="width: 100%; max-height: 500px; object-fit: contain; border-radius: 4px; transition: transform 0.3s ease;" 
										data-index="${index}" 
										data-rotation="0"
									/>
									<button class="rotate-btn" 
										data-target-index="${index}" 
										style="position: absolute; top: 10px; right: 10px; background: #fff; border: 1px solid #ccc; border-radius: 4px; padding: 4px; cursor: pointer;">
										⤾ Rotate
									</button>
								</div>
							`).join("")}
						</div>
					`);

					const sub_dialog = new frappe.ui.Dialog({
						title: `${section} Images`,
						fields: [
							{
								fieldtype: 'HTML',
								fieldname: 'image_html',
								options: wrapper.prop('outerHTML')
							}
						],
						size: 'extra-large'
					});

					sub_dialog.show();

					setTimeout(() => {
						$(`#${wrapper_id} .rotate-btn`).on('click', function () {
							const index = $(this).data('target-index');
							const img = $(`#${wrapper_id} img[data-index="${index}"]`);
							let current = parseInt(img.attr('data-rotation') || 0);
							const next = (current + 90) % 360;
							img.css('transform', `rotate(${next}deg)`);
							img.attr('data-rotation', next);
						});

						// Add Save Button after images
						const saveBtn = $(`
							<div style="margin-top: 20px; text-align: center;">
								<button class="btn btn-primary save-rotated-images">Save Rotated Images</button>
							</div>
						`);
						$(`#${wrapper_id}`).after(saveBtn);

						$('.save-rotated-images').on('click', function () {
							const promises = [];

							$(`#${wrapper_id} img`).each(function () {
								const img = $(this);
								const rotation = parseInt(img.attr('data-rotation') || 0);
								const index = parseInt(img.attr('data-index'));

								// Only save if rotated
								if (rotation !== 0) {
									const tempImage = new Image();
									tempImage.crossOrigin = "anonymous";
									tempImage.src = img.attr('src');

									const p = new Promise((resolve, reject) => {
										tempImage.onload = function () {
											const canvas = document.createElement('canvas');
											const ctx = canvas.getContext('2d');

											const maxWidth = 1024;
											const maxHeight = 1024;

											let width = tempImage.width;
											let height = tempImage.height;

											if (width > maxWidth || height > maxHeight) {
												const ratio = Math.min(maxWidth / width, maxHeight / height);
												width = width * ratio;
												height = height * ratio;
											}

											canvas.width = rotation % 180 === 0 ? width : height;
											canvas.height = rotation % 180 === 0 ? height : width;

											ctx.translate(canvas.width / 2, canvas.height / 2);
											ctx.rotate(rotation * Math.PI / 180);
											ctx.drawImage(tempImage, -width / 2, -height / 2, width, height);

											canvas.toBlob(blob => {
												const file = new File([blob], `rotated_${Date.now()}.png`, { type: 'image/png' });

												const reader = new FileReader();
												reader.onload = function (event) {
													const base64 = event.target.result.split(',')[1];

													frm.call({
														method: "replace_existing_file",
														doc: frm.doc,
														args: {
															file_url: image_rows[index].image,  // Existing image URL
															filedata_base64: base64,
														},
														callback: (r) => {
															if (!r.exc) {
																frappe.msgprint('Image replaced successfully.');
																resolve();
															} else {
																reject(r.exc);
															}
														}
													});
												};
												reader.readAsDataURL(file);
											}, 'image/png');
										};
									});

									promises.push(p);
								}
							});

							Promise.all(promises)
								.then(() => {
									sub_dialog.set_value('images', image_rows);
									sub_dialog.fields_dict.images.df.data = image_rows;
									sub_dialog.fields_dict.images.grid.refresh();
									frappe.msgprint('All rotated images saved!');
									sub_dialog.hide()
									dialog.hide()
								})
								.catch(err => {
									console.error(err);
									sub_dialog.hide()
								});
						});
					}, 200);
				}
			}

		],
		primary_action_label: 'Save',
		primary_action(values) {
			// Clear existing child table
			frm.clear_table(fieldname);

			// Push updated rows to the child table
			(values.images || []).forEach(row => {
				frm.add_child(fieldname, {
					image: row.image,
				});
			});

			frm.refresh_field(fieldname);
			dialog.hide();
		}
	});

	// Set initial data into dialog table
	dialog.set_value('images', image_rows);
	dialog.fields_dict.images.df.data = image_rows;
	dialog.fields_dict.images.grid.refresh();
	dialog.show();
}



function setupImagePreview(childTable) {
	frappe.ui.form.on(childTable, {
		preview: function (frm, cdt, cdn) {
			let row = locals[cdt][cdn];
			if (!row.image) {
				frappe.msgprint("No image to preview.");
				return;
			}

			frappe.msgprint({
				title: 'Image Preview',
				indicator: 'blue',
				message: `<div style="text-align:center">
							<img src="${row.image}" style="max-width:100%; max-height:auto; border:1px solid #ddd;"/>
						  </div>`,
				wide: true
			});
		}
	});
}

// Register for all related child tables
['Preventive Maintenance Before', 'Preventive Maintenance After', 'Preventive Maintenance During', 'Preventive Maintenance Additional']
	.forEach(setupImagePreview);

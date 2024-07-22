import logging
from datetime import datetime

from odoo import fields, models, api
from odoo.exceptions import ValidationError
from odoo.tools.float_utils import float_round, float_compare

from odoo.addons.oo_total_solutions_esd_api.models.esd import (
    PATHS,
    ROUNDING,
    DATETIME_FORMAT,
)

_logger = logging.getLogger(__name__)


class PosSession(models.Model):
    _inherit = "pos.session"

    def _loader_params_res_company(self):
        res = super()._loader_params_res_company()
        res["search_params"]["fields"].append("esd_enable")
        return res


class PosOrder(models.Model):
    _name = "pos.order"
    _inherit = ["pos.order", "oo.esd.api"]

    esd_signature = fields.Char(
        string="ESD Signature", readonly=True, copy=False, store=True
    )
    esd_qr_code = fields.Binary(
        string="Esd QR Code", copy=False, attachment=True, readonly=True, store=True
    )
    esd_date_signed = fields.Datetime(
        string="Esd Date Signed", readonly=True, copy=False, store=True
    )
    esd_device_serial = fields.Char(
        string="Esd Device Serial", readonly=True, copy=False, store=True
    )
    esd_total_signed = fields.Float(
        string="Total Amount Signed", copy=False, readonly=True, store=True
    )
    esd_url = fields.Char(string="ESD URL", readonly=True, copy=False, store=True)
    esd_state = fields.Selection(
        [
            ("not_signed", "Not Signed"),
            ("signing", "Signing in Progress"),
            ("signed", "Signed"),
            ("failed", "Signing Failed"),
        ],
        string="ESD State",
        default="not_signed",
        copy=False,
        store=True,
    )

    def action_pos_order_paid(self):
        res = super().action_pos_order_paid()
        _logger.info("POS Order paid action triggered for order %s", self.name)

        if self.company_id.esd_enable:
            _logger.info(
                "ESD is enabled for company %s. Initiating signing process.",
                self.company_id.name,
            )
            self._sign_order()
        else:
            _logger.info(
                "ESD is not enabled for company %s. Skipping signing process.",
                self.company_id.name,
            )

        return res

    def _sign_order(self):
        self.ensure_one()
        _logger.info("Starting sign order process for POS order %s", self.name)

        if self.esd_state != "not_signed":
            _logger.info(
                "Order %s is already in state %s. Skipping signing process.",
                self.name,
                self.esd_state,
            )
            return True

        self.esd_state = "signing"
        try:
            _logger.info("Initializing ESD for order %s", self.name)
            status = self.initialize(self.company_id)
            if not status:
                raise ValidationError("Failed to initialize ESD")

            _logger.info("Registering receipt for order %s", self.name)
            status = self.register_receipt()
            if not status:
                raise ValidationError("Failed to register receipt")

            _logger.info("Selling PLU from ExtDB for order %s", self.name)
            all_registered = self._sell_plu_from_extdb()
            if not all_registered:
                raise ValidationError("Failed to register all PLUs")

            _logger.info("Reading receipt information for order %s", self.name)
            receipt_info_res = self.read_receipt_information()

            _logger.info("Closing receipt for order %s", self.name)
            sign_response = self.close_receipt()

            _logger.info("Processing signing response for order %s", self.name)
            response_signature = self._retrieve_signed_invoice_data(sign_response)

            _logger.info("Reading receipt date for order %s", self.name)
            date_response = self._read_receipt_date()

            _logger.info("Reading CU numbers for order %s", self.name)
            serial_response = self._read_cu_numbers()

            date_signed = datetime.strptime(
                date_response.get("@Value"), DATETIME_FORMAT
            )
            device_serial = self._retrieve_signed_invoice_data(serial_response)
            esd_total_signed = self._get_total_signed_amount(receipt_info_res)

            _logger.info("Updating order %s with signing information", self.name)
            self.write(
                {
                    "esd_date_signed": date_signed,
                    "esd_device_serial": device_serial.get("SerialNumber"),
                    "esd_total_signed": esd_total_signed,
                    "esd_signature": response_signature.get("InvoiceNum"),
                    "esd_qr_code": self._make_signature_qrcode(
                        response_signature.get("QRcode")
                    ),
                    "esd_url": response_signature.get("QRcode"),
                    "esd_state": "signed",
                }
            )
            _logger.info("Successfully signed order %s", self.name)
        except Exception as e:
            _logger.error(
                "Error during signing process for order %s: %s", self.name, str(e)
            )
            self.esd_state = "failed"
            self.message_post(body=f"Signing failed: {str(e)}")
            # Optionally, raise the exception if you want to interrupt the process
            # raise

        return True

    def _sell_plu_from_extdb(self):
        self.ensure_one()
        _logger.info("Starting _sell_plu_from_extdb for order %s", self.name)
        all_registered = True
        for line in self.lines:
            if (
                float_compare(line.discount, float(100), precision_rounding=ROUNDING)
                == 0
            ):
                _logger.info(
                    "Skipping 100%% discounted line for product %s in order %s",
                    line.product_id.name,
                    self.name,
                )
                continue

            _logger.info(
                "Processing line for product %s in order %s",
                line.product_id.name,
                self.name,
            )
            hscode, vat_tax, price_unit = self._get_hscode_and_vat_amounts(line)

            endpoint = PATHS["sell_item_hs"] if hscode else PATHS["sell_item"]
            payload = self._prepare_sell_plu_payload(line, hscode, vat_tax, price_unit)

            _logger.info(
                "Calling ESD API for product %s in order %s with endpoint %s",
                line.product_id.name,
                self.name,
                endpoint,
            )
            response = self.call_esd(self.company_id, endpoint, payload)

            if not response:
                _logger.warning(
                    "Failed to register product %s in order %s",
                    line.product_id.name,
                    self.name,
                )
                all_registered = False

        _logger.info(
            "Finished _sell_plu_from_extdb for order %s. All registered: %s",
            self.name,
            all_registered,
        )
        return all_registered

    def _get_hscode_and_vat_amounts(self, line):
        _logger.info(
            "Getting HSCode and VAT amounts for product %s in order %s",
            line.product_id.name,
            self.name,
        )
        kes = self.env["res.currency"].search([("name", "=", "KES")], limit=1)
        hscode = line.product_id.hscode_id.name if line.product_id.hscode_id else None

        vat_tax = line.tax_ids.filtered("esd_tax_band")
        if not vat_tax:
            raise ValidationError(
                f"Every line must have a tax with a valid tax band in taxes, for line with product {line.product_id.name}!"
            )

        vat_tax = vat_tax[0] if len(vat_tax) > 1 else vat_tax
        price_unit_kes = self.currency_id._convert(
            line.price_unit, kes, self.company_id, self.date_order
        )
        price_unit = vat_tax.compute_all(price_unit_kes).get("total_included")

        _logger.info(
            "HSCode: %s, VAT Tax: %s, Price Unit: %s for product %s in order %s",
            hscode,
            vat_tax.name,
            price_unit,
            line.product_id.name,
            self.name,
        )
        return hscode, vat_tax, price_unit

    def _prepare_sell_plu_payload(self, line, hscode, vat_tax, price_unit):
        _logger.info(
            "Preparing sell PLU payload for product %s in order %s",
            line.product_id.name,
            self.name,
        )
        payload = {
            "NamePLU": self._remove_non_alphanumerics(line.product_id.name)[:36],
            "Price": float_round(price_unit, precision_rounding=ROUNDING),
            "Quantity": float_round(abs(line.qty), precision_rounding=ROUNDING),
            "DiscAddP": (float_round(line.discount, precision_rounding=ROUNDING) * -1)
            or "",
        }

        if hscode:
            payload["HSCode"] = hscode
        else:
            payload.update(
                {
                    "OptionVATClass": vat_tax.esd_tax_band,
                    "HSCode": "",
                    "HSName": "",
                    "MeasureUnit": self._remove_non_alphanumerics(
                        line.product_uom_id.name
                    )[:36],
                    "VATGrRate": float_round(
                        vat_tax.amount, precision_rounding=ROUNDING
                    ),
                }
            )

        _logger.info(
            "Prepared payload for product %s in order %s: %s",
            line.product_id.name,
            self.name,
            payload,
        )
        return payload

    @api.model
    def create_from_ui(self, orders, draft=False):
        _logger.info("Creating POS orders from UI")
        order_ids = super().create_from_ui(orders, draft)

        # Sign orders that are not drafts
        for order in self.browse([o["id"] for o in order_ids]).filtered(
            lambda o: not o.state == "draft"
        ):
            if order.company_id.esd_enable:
                _logger.info("Signing order %s after creation from UI", order.name)
                order._sign_order()
            else:
                _logger.info(
                    "Skipping signing for order %s (ESD not enabled)", order.name
                )

        return order_ids

    @api.model
    def _order_fields(self, ui_order):
        _logger.info("Processing order fields for UI order")
        fields = super()._order_fields(ui_order)

        # Add ESD related fields if present in ui_order
        esd_fields = [
            "esd_signature",
            "esd_qr_code",
            "esd_date_signed",
            "esd_device_serial",
            "esd_total_signed",
            "esd_url",
        ]
        for field in esd_fields:
            if field in ui_order:
                fields[field] = ui_order[field]

        _logger.info("Processed order fields: %s", fields)
        return fields

    def _export_for_ui(self, order):
        _logger.info("Exporting order %s for UI", order.name)
        result = super()._export_for_ui(order)

        # Add ESD related fields to the exported data
        esd_fields = [
            "esd_signature",
            "esd_qr_code",
            "esd_date_signed",
            "esd_device_serial",
            "esd_total_signed",
            "esd_url",
            "esd_state",
        ]
        for field in esd_fields:
            result[field] = getattr(order, field, False)

        _logger.info("Exported data for order %s: %s", order.name, result)
        return result

    @api.model
    def get_esd_status(self, order_id):
        _logger.info("Getting ESD status for order ID %s", order_id)
        order = self.browse(order_id)
        return {
            "state": order.esd_state,
            "signature": order.esd_signature,
            "qr_code": order.esd_qr_code,
            "date_signed": order.esd_date_signed,
            "device_serial": order.esd_device_serial,
            "total_signed": order.esd_total_signed,
            "url": order.esd_url,
        }

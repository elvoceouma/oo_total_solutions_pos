from odoo import fields, models, api
from odoo.exceptions import ValidationError
import logging

_logger = logging.getLogger(__name__)


class PosOrder(models.Model):
    _inherit = "pos.order"

    esd_signature = fields.Char(string="ESD Signature", readonly=True, copy=False)
    esd_qr_code = fields.Binary(string="ESD QR Code", attachment=True, readonly=True)
    esd_date_signed = fields.Datetime(
        string="ESD Date Signed", readonly=True, copy=False
    )
    esd_device_serial = fields.Char(
        string="ESD Device Serial", readonly=True, copy=False
    )
    esd_total_signed = fields.Float(
        string="Total Amount Signed", copy=False, readonly=True
    )

    @api.model
    def _order_fields(self, ui_order):
        fields = super()._order_fields(ui_order)
        for field in [
            "esd_signature",
            "esd_qr_code",
            "esd_date_signed",
            "esd_device_serial",
            "esd_total_signed",
        ]:
            if field in ui_order:
                fields[field] = ui_order[field]
        return fields

    @api.model
    def create_from_ui(self, orders, draft=False):
        order_ids = super().create_from_ui(orders, draft)
        for order in self.browse([o["id"] for o in order_ids]):
            if order.esd_signature:
                _logger.info(
                    f"Order {order.name} created with ESD signature: {order.esd_signature}"
                )
            else:
                _logger.warning(f"Order {order.name} created without ESD signature")
        return order_ids

    def _export_for_ui(self, order):
        result = super()._export_for_ui(order)
        result.update(
            {
                "esd_signature": order.esd_signature,
                "esd_qr_code": order.esd_qr_code,
                "esd_date_signed": order.esd_date_signed,
                "esd_device_serial": order.esd_device_serial,
                "esd_total_signed": order.esd_total_signed,
            }
        )
        return result

from odoo import http
from odoo.http import request


class PosController(http.Controller):

    @http.route("/point_of_sale/update_order_kra_data", type="json", auth="user")
    def update_order_kra_data(
        self, order_id, esd_qr_code, esd_signature, esd_device_serial
    ):
        order = (
            request.env["pos.order"]
            .sudo()
            .search([("pos_reference", "=", order_id)], limit=1)
        )
        if order:
            order.write(
                {
                    "esd_qr_code": esd_qr_code,
                    "esd_signature": esd_signature,
                    "esd_device_serial": esd_device_serial,
                }
            )
            return True
        return False

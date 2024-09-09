/** @odoo-module */

import { Order } from "@point_of_sale/app/store/models";
import { patch } from "@web/core/utils/patch";


patch(Order.prototype, {
    export_for_printing() {
        const res = super.export_for_printing(...arguments);
        res.esd_qr_code = this.esd_qr_code;
        res.esd_date_signed = this.esd_date_signed;
        res.esd_signature = this.esd_signature;
        res.esd_device_serial = this.esd_device_serial;
        res.esd_total_signed = this.esd_total_signed;
        console.log('res final:', res);

        return res;
    },
});

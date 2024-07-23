

/** @odoo-module **/

import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { Order, Payment } from "@point_of_sale/app/store/models";
import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { ErrorPopup } from "@point_of_sale/app/errors/popups/error_popup";
import { TextInputPopup } from "@point_of_sale/app/utils/input_popups/text_input_popup";
import { useService } from "@web/core/utils/hooks";
import { usePos } from "@point_of_sale/app/store/pos_hook";
const { Component, onWillStart, onMounted, useRef, useState } = owl;
import { loadJS, loadCSS } from "@web/core/assets";


patch(Order.prototype, {
    setup() {
        super.setup(...arguments);
        this.esd_qr_code = null;
        this.esd_signature = null;
        this.esd_device_serial = null;
        this.esd_date_signed = null;
        this.esd_total_signed = null;
    },

    init_from_JSON(json) {
        super.init_from_JSON(json);
        this.esd_qr_code = json.esd_qr_code || null;
        this.esd_signature = json.esd_signature || null;
        this.esd_device_serial = json.esd_device_serial || null;
        this.esd_date_signed = json.esd_date_signed || null;
        this.esd_total_signed = json.esd_total_signed || null;
    },

    export_as_JSON() {
        const json = super.export_as_JSON();
        json.esd_qr_code = this.esd_qr_code;
        json.esd_signature = this.esd_signature;
        json.esd_device_serial = this.esd_device_serial;
        json.esd_date_signed = this.esd_date_signed;
        json.esd_total_signed = this.esd_total_signed;
        return json;
    },
});

patch(PaymentScreen.prototype, {
    setup() {
        super.setup();
        this.pos = usePos();
        this.orm = useService("orm");
        this.rpc = useService("rpc");
        this.popup = useService("popup");
        this.state = useState({
            setIsLoading: false
        });
        onWillStart(async () => {
            await loadJS("https://cdnjs.cloudflare.com/ajax/libs/axios/1.7.2/axios.min.js");
            await loadJS("https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js");
        });
    },

    async validateOrder(isForceValidate) {
        this.state.isLoading = true;
        try {
            const order = this.pos.get_order();
            const kraData = await this.initiateKPAPush(order);
            if (kraData) {
                order.esd_qr_code = kraData.qrCode;
                order.esd_signature = kraData.invoiceCuNo;
                order.esd_device_serial = kraData.deviceSerial;
                order.esd_date_signed = kraData.dateSigned;
                order.esd_total_signed = kraData.totalSigned;
            }
            await super.validateOrder(isForceValidate);
        } catch (error) {
            console.error("Error in validateOrder:", error);
            this.notification.add(_t("Failed to validate order. Please try again."), {
                type: 'danger',
            });
        } finally {
            this.state.isLoading = false;
        }
    },

    async initiateKPAPush() {
        try {
            const order = this.pos.get_order();
            const partner = order.get_partner();

            // Prepare invoice lines dynamically
            const invoiceLines = order.get_orderlines().map((orderLine, index) => {
                const product = orderLine.get_product();
                const taxes = orderLine.get_taxes();
                const taxRate = taxes.length > 0 ? taxes[0].amount : 0;
                return {
                    "id": (index + 1).toString(),
                    "invDate": "string",
                    "invNumber": "INV001",
                    "custName": "Customer",
                    "itemName": product.display_name,
                    "unitPrice": orderLine.get_unit_price().toFixed(2),
                    "taxRate": "1",
                    "taxTypeId": "1",
                    "taxName": "A",
                    "unitQuantity": "1",
                    "hsCode": "",
                    "hsDesc": "",
                    "discountAddP": "",
                    "isInValidHsCode": true,
                    "uom": "kgs"
                };
            });
            console.log("Invoice Lines", invoiceLines);

            const response = await axios.post("http://localhost:90/api/v1/tims/send",
                {
                    "invNo": order.name,
                    "customerName": partner ? partner.name : "Customer",
                    "pinNo": "P051594966W",
                    "headQuarters": "Eva Bazaar",
                    "address": "Kenya",
                    "postalCode": "string",
                    "exempt": "string",
                    "invoiceLines": invoiceLines
                });

            console.log("KPAP Push Response:", response.data);
 // Function to format date to the required format
 function formatDate() {
    const date = new Date();
    const pad = (number) => number.toString().padStart(2, '0');

    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

const formattedDate = formatDate();
            if (response.data && response.data.code === 0) {
                const { qrCode, cuNumber } = response.data.data;
                console.log("QR Code URL:", qrCode);
                console.log("Invoice CU number:", cuNumber);

                if (qrCode) {
                    const qrCodeBase64 = await this.generateQRCode(qrCode);
                    console.log("Base 64 image", qrCodeBase64);
                    return {
                        qrCode: qrCodeBase64,
                        invoiceCuNo: cuNumber,
                        deviceSerial: "KRAMW011202207961149",
                        dateSigned: formattedDate,
                        totalSigned: order.get_total_with_tax()
                    };
                }
            }
            console.log("KPAP Push failed or invalid response");
        } catch (error) {
            console.error("Error in KPAP Push:", error);
        }
        return null;
    },

    async generateQRCode(url) {
        try {
            const response = await axios.get(`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(url)}`, {
                responseType: 'arraybuffer'
            });
            const uint8Array = new Uint8Array(response.data);
            let base64 = btoa(String.fromCharCode.apply(null, uint8Array));

            // Ensure the base64 string length is a multiple of 4
            while (base64.length % 4 !== 0) {
                base64 += '=';
            }

            return base64
        } catch (error) {
            console.error('Error generating QR code:', error);
            return null;
        }
    },

    async sendKraDataToBackend(kraData) {
        const order = this.pos.get_order();
        if (kraData) {
            try {
                const result = await this.rpc('/point_of_sale/update_order_kra_data', {
                    order_id: order.name,
                    esd_qr_code: kraData.qrCode,
                    esd_signature: kraData.invoiceCuNo,
                    // esd_device_serial: kraData.deviceSerial,
                });
                if (result) {
                    this.popup.add(_t("KRA data updated successfully"), {
                        type: 'success',
                    });
                } else {
                    throw new Error("Failed to update KRA data");
                }
            } catch (error) {
                console.error("Error sending KRA data to backend:", error);
                this.popup.add(_t("Failed to send KRA data to the server. Please try again or contact support."), {
                    type: 'danger',
                });
            }
        }
    }
});

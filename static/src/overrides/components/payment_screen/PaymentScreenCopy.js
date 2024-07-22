// /** @odoo-module **/

// import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
// import { Order, Payment } from "@point_of_sale/app/store/models";
// import { patch } from "@web/core/utils/patch";
// import { _t } from "@web/core/l10n/translation";
// import { ErrorPopup } from "@point_of_sale/app/errors/popups/error_popup";
// import { TextInputPopup } from "@point_of_sale/app/utils/input_popups/text_input_popup";
// import { useService } from "@web/core/utils/hooks";
// import { usePos } from "@point_of_sale/app/store/pos_hook";
// const { Component, onWillStart, onMounted, useRef, useState } = owl;
// import { loadJS, loadCSS } from "@web/core/assets";


// patch(Order.prototype, {
//     setup() {
//         super.setup(...arguments);
//         this.esd_qr_code = null;
//         this.esd_signature = null;
//         this.esd_device_serial = null;
//     },

//     init_from_JSON(json) {
//         super.init_from_JSON(json);
//         this.esd_qr_code = json.esd_qr_code || null;
//         this.esd_signature = json.esd_signature || null;
//         this.esd_device_serial = json.esd_device_serial || null;
//     },

//     set_kra_data(kraData) {
//         this.esd_qr_code = kraData.qrCode || null;
//         this.esd_signature = kraData.invoiceCuNo || null;
//         this.esd_device_serial = kraData.deviceSerial || null;
//     },

//     get_kra_data() {
//         return {
//             esd_qr_code: this.esd_qr_code,
//             esd_signature: this.esd_signature,
//             esd_device_serial: this.esd_device_serial
//         };
//     },

//     export_as_JSON() {
//         const json = super.export_as_JSON();
//         json.esd_qr_code = this.esd_qr_code;
//         json.esd_signature = this.esd_signature;
//         json.esd_device_serial = this.esd_device_serial;
//         return json;
//     },

//     export_for_printing() {
//         const result = super.export_for_printing(...arguments);
//         result.esd_qr_code = this.esd_qr_code;
//         result.esd_signature = this.esd_signature;
//         result.esd_device_serial = this.esd_device_serial;
//         return result;
//     },
// });

// patch(PaymentScreen.prototype, {
//     setup() {
//         super.setup();
//         this.pos = usePos();
//         this.orm = useService("orm");
//         this.rpc = useService("rpc");
//         this.popup = useService("popup");
//         this.state = useState({
//             setIsLoading: false
//         });
//         onWillStart(async () => {
//             await loadJS("https://cdnjs.cloudflare.com/ajax/libs/axios/1.7.2/axios.min.js");
//             await loadJS("https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js");
//         });
//     },

//     async validateOrder(isForceValidate) {
//         super.validateOrder(isForceValidate);
//         console.log("Starting validateOrder");
//         const kraData = await this.initiateKPAPush();
//         console.log("KRA Data received:", kraData);
//         if (kraData) {
//             const order = this.pos.get_order();
//             order.set_kra_data(kraData);
//             console.log("KRA Data set on order:", order.get_kra_data());
//             // await this.sendKraDataToBackend(kraData);
//         } else {
//             console.warn("No KRA Data received");
//         }


//     },

//     async initiateKPAPush() {
//         try {
//             const order = this.pos.get_order();
//             const partner = order.get_partner();

//             // Prepare invoice lines dynamically
//             const invoiceLines = order.get_orderlines().map((orderLine, index) => {
//                 const product = orderLine.get_product();
//                 const taxes = orderLine.get_taxes();
//                 const taxRate = taxes.length > 0 ? taxes[0].amount : 0;
//                 return {
//                     "id": (index + 1).toString(),
//                     "invDate": "string",
//                     "invNumber": "INV001",
//                     "custName": "Customer",
//                     "itemName": product.display_name,
//                     "unitPrice": orderLine.get_unit_price().toFixed(2),
//                     "taxRate": "1",
//                     "taxTypeId": "1",
//                     "taxName": "A",
//                     "unitQuantity": "1",
//                     "hsCode": "",
//                     "hsDesc": "",
//                     "discountAddP": "",
//                     "isInValidHsCode": true,
//                     "uom": "kgs"
//                 };
//             });
//             console.log("Invoice Lines", invoiceLines);

//             const response = await axios.post("http://localhost:90/api/v1/tims/send",
//                 {
//                     "invNo": order.name,
//                     "customerName": partner ? partner.name : "Customer",
//                     "pinNo": "P051594966W",
//                     "headQuarters": "Eva Bazaar",
//                     "address": "Kenya",
//                     "postalCode": "string",
//                     "exempt": "string",
//                     "invoiceLines": invoiceLines
//                 });

//             console.log("KPAP Push Response:", response.data);

//             if (response.data && response.data.code === 0) {
//                 const { qrCode, cuNumber } = response.data.data;
//                 console.log("QR Code URL:", qrCode);
//                 console.log("Invoice CU number:", cuNumber);

//                 if (qrCode) {
//                     const qrCodeBase64 = await this.generateQRCode(qrCode);
//                     console.log("Base 64 image", qrCodeBase64);
//                     return {
//                         qrCode: qrCodeBase64,
//                         invoiceCuNo: cuNumber,
//                         deviceSerial: "KRAMW011202207961149",
//                         dateSigned: new Date().toISOString(),
//                     };
//                 }
//             }
//             console.log("KPAP Push failed or invalid response");
//         } catch (error) {
//             console.error("Error in KPAP Push:", error);
//         }
//         return null;
//     },

//     async generateQRCode(url) {
//         try {
//             const response = await axios.get(`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(url)}`, {
//                 responseType: 'arraybuffer'
//             });
//             const uint8Array = new Uint8Array(response.data);
//             let base64 = btoa(String.fromCharCode.apply(null, uint8Array));

//             // Ensure the base64 string length is a multiple of 4
//             while (base64.length % 4 !== 0) {
//                 base64 += '=';
//             }

//             return base64
//         } catch (error) {
//             console.error('Error generating QR code:', error);
//             return null;
//         }
//     },

//     async sendKraDataToBackend(kraData) {
//         const order = this.pos.get_order();
//         if (kraData) {
//             try {
//                 const result = await this.rpc('/point_of_sale/update_order_kra_data', {
//                     order_id: order.name,
//                     esd_qr_code: kraData.qrCode,
//                     esd_signature: kraData.invoiceCuNo,
//                     // esd_device_serial: kraData.deviceSerial,
//                 });
//                 if (result) {
//                     this.popup.add(_t("KRA data updated successfully"), {
//                         type: 'success',
//                     });
//                 } else {
//                     throw new Error("Failed to update KRA data");
//                 }
//             } catch (error) {
//                 console.error("Error sending KRA data to backend:", error);
//                 this.popup.add(_t("Failed to send KRA data to the server. Please try again or contact support."), {
//                     type: 'danger',
//                 });
//             }
//         }
//     }
// });


// /** @odoo-module **/

// import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
// import { patch } from "@web/core/utils/patch";
// import { useService } from "@web/core/utils/hooks";


// patch(PaymentScreen.prototype, {
//     setup() {
//         super.setup();
//         this.orm = useService("orm");
//         this.rpc = useService("rpc");
//     },

//     async validateOrder(isForceValidate) {
//         await super.validateOrder(isForceValidate);
//         try {
//             console.log("calling tims_sign_receipt");
//             const result = await this.tims_sign_receipt();
//             console.log(result);
//             return result
//         } catch (error) {
//             console.log("An error ocuured in tims_sign_receipt", error);
//         }

//     },

//     async tims_sign_receipt() {
//         const self = this
//         if (self.pos.company.esd_enable) {
//             let order = self.pos.get_order();
//             console.log(order);
//             try {

//                 const result = await this.orm.call("pos.order", "tims_receipt_payload", [order.name])
//             } catch (error) {
//                 console.error(error);
//             }
//             console.log('result :', result);
//             order.esd_qr_code = result.esd_qr_code;;
//             order.esd_date_signed = result.esd_date_signed;
//             order.esd_signature = result.esd_signature;
//             order.esd_device_serial = result.esd_device_serial;
//             order.esd_total_signed = result.esd_total_signed;
//         }
//         else {
//             console.log("ESD is not enabled");
//         }
//     }
// })

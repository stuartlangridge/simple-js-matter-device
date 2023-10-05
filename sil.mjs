import { CommissioningServer, MatterServer } from "@project-chip/matter-node.js";
import { OnOffLightDevice, OnOffPluginUnitDevice } from "@project-chip/matter-node.js/device";
import { StorageBackendDisk, StorageManager } from "@project-chip/matter-node.js/storage";
import { Time } from "@project-chip/matter-node.js/time";
import { DeviceTypeId, VendorId } from "@project-chip/matter.js/datatype";
import { Format, Level, Logger } from "@project-chip/matter-node.js/log";

const logger = Logger.get("Device");
Logger.defaultLogLevel = Level.INFO;
Logger.format = Format.ANSI;

const storageLocation = "storage";
const clearStorage = false;
const storage = new StorageBackendDisk(storageLocation, clearStorage);

class Device {
    async start() {
        logger.info(`node-matter`);
        const storageManager = new StorageManager(storage);
        await storageManager.initialize();
        const deviceStorage = storageManager.createContext("Device");                
        const isSocket = deviceStorage.get("isSocket", false); // not a socket

        const deviceName = "Stuart test device";
        const vendorName = "Kryogenix";
        const passcode = deviceStorage.get("passcode", 20202021);
        const discriminator = deviceStorage.get("discriminator", 3840);
        // product name / id and vendor id should match what is in the device certificate
        const vendorId = deviceStorage.get("vendorid", 0xfff1);
        const productName = `Stuart ${isSocket ? "Socket" : "Light"}`;
        const productId = deviceStorage.get("productid", 0x8000);

        const port = 5540; // must be 5540 for Alexa

        const uniqueId = deviceStorage.get("uniqueid", Time.nowMs());

        deviceStorage.set("passcode", passcode);
        deviceStorage.set("discriminator", discriminator);
        deviceStorage.set("vendorid", vendorId);
        deviceStorage.set("productid", productId);
        deviceStorage.set("isSocket", isSocket);
        deviceStorage.set("uniqueid", uniqueId);

        const onOffDevice = isSocket ? new OnOffPluginUnitDevice() : new OnOffLightDevice();
        onOffDevice.addOnOffListener(on => {
            console.log("!!!!!!!!!!!!!!!! GOT COMMAND", on);
        });
        onOffDevice.addCommandHandler("identify", async ({ request: { identifyTime } }) =>
            logger.info(`Identify called for OnOffDevice: ${identifyTime}`),
        );

        this.matterServer = new MatterServer(storageManager);
        const commissioningServer = new CommissioningServer({
            port,
            deviceName,
            deviceType: DeviceTypeId(onOffDevice.deviceType),
            passcode,
            discriminator,
            basicInformation: {
                vendorName,
                vendorId: VendorId(vendorId),
                nodeLabel: productName,
                productName,
                productLabel: productName,
                productId,
                serialNumber: `node-matter-${uniqueId}`,
            },
            delayedAnnouncement: false
        });

        commissioningServer.addCommandHandler("testEventTrigger", async ({ request: { enableKey, eventTrigger } }) =>
            logger.info(`testEventTrigger called on GeneralDiagnostic cluster: ${enableKey} ${eventTrigger}`),
        );
        commissioningServer.addDevice(onOffDevice);
        this.matterServer.addCommissioningServer(commissioningServer);

        await this.matterServer.start();
        //logEndpoint(commissioningServer.getRootEndpoint());

        if (!commissioningServer.isCommissioned()) {
            const pairingData = commissioningServer.getPairingCode({
                ble: false,
                softAccessPoint: false,
                onIpNetwork: false,
            });

            const { qrCode, qrPairingCode, manualPairingCode } = pairingData;

            console.log(qrCode);
            logger.info(
                `QR Code URL: https://project-chip.github.io/connectedhomeip/qrcode.html?data=${qrPairingCode}`,
            );
            logger.info(`Manual pairing code: ${manualPairingCode}`);
        } else {
            logger.info("Device is already commissioned. Waiting for controllers to connect ...");
        }
    }

    async stop() {
        await this.matterServer?.close();
    }
}

const device = new Device();
device
    .start()
    .then(() => {
        /* done */
    })
    .catch(err => console.error(err));

process.on("SIGINT", () => {
    device
        .stop()
        .then(() => {
            // Pragmatic way to make sure the storage is correctly closed before the process ends.
            storage
                .close()
                .then(() => process.exit(0))
                .catch(err => console.error(err));
        })
        .catch(err => console.error(err));
});

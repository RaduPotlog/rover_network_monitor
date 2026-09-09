# Rover A1 networking — Packet Tracer build

This bundle translates `Rover-A1-001_networking.png` into a deployable Packet Tracer topology.

## Devices and addressing

| Diagram component | Packet Tracer representation | Addressing |
| --- | --- | --- |
| Tekwill WiFi | Linksys WRT300N (`TEKWILL-WIFI`) | RUTX11 WAN: `172.22.100.97/24` |
| RUTX11 Wi-Fi/GSM/GPS router | Cisco 2911 (`RUTX11`) | LAN `192.168.1.1/24`; WLAN `192.168.77.1/24` |
| Rear LED/BMS/BLE reader controller | PC (`REAR_LED_BMS_BLE_READER`) | WLAN `192.168.77.201/24` |
| ROS controller / Rover ROS2 stack | Cisco 2911 (`ROS_CONTROLLER`) | ETH1 `192.168.1.201/24`; ETH0 `192.168.88.10/24`; WLAN0 `192.168.77.203/24` |
| Safety PLC | PC (`SAFETY_PLC`) | ETH0 `192.168.88.11/24` |

`WLAN-EMULATION-SW` represents the shared 192.168.77.0/24 Wi-Fi medium. This preserves the IP topology because Packet Tracer's automation interface cannot configure RUTX11 hardware or scripted Wi-Fi association.

## Deploying it

1. Open Cisco Packet Tracer and enable **Extensions > MCP BUILDER**.
2. Use the MCP Builder deployment function with `plan.json`, or run `full_build.js` in its Script Engine.
3. Save the opened topology as `Rover-A1-001_networking.pkt`.

`topology.js` creates the devices and links. The `*_config.txt` files provide the generated IOS configurations for the RUTX11 and ROS-controller representations.

lwAddDevice("TEKWILL-WIFI", 11, "Linksys-WRT300N", 120, 100);
lwAddDevice("RUTX11", 0, "2911", 480, 180);
lwAddDevice("WLAN-EMULATION-SW", 1, "2960-24TT", 350, 330);
lwAddDevice("REAR_LED_BMS_BLE_READER", 8, "PC-PT", 120, 460);
lwAddDevice("ROS_CONTROLLER", 0, "2911", 600, 430);
lwAddDevice("SAFETY_PLC", 8, "PC-PT", 800, 560);
lwAddLink("TEKWILL-WIFI", "Ethernet 1", "RUTX11", "GigabitEthernet0/0", 8100);
lwAddLink("RUTX11", "GigabitEthernet0/1", "ROS_CONTROLLER", "GigabitEthernet0/0", 8101);
lwAddLink("RUTX11", "GigabitEthernet0/2", "WLAN-EMULATION-SW", "GigabitEthernet0/1", 8100);
lwAddLink("WLAN-EMULATION-SW", "FastEthernet0/1", "REAR_LED_BMS_BLE_READER", "FastEthernet0", 8100);
lwAddLink("WLAN-EMULATION-SW", "FastEthernet0/2", "ROS_CONTROLLER", "GigabitEthernet0/2", 8100);
lwAddLink("ROS_CONTROLLER", "GigabitEthernet0/1", "SAFETY_PLC", "FastEthernet0", 8101);
/* === Configuraciones CLI por dispositivo ===
Copiar y pegar en la CLI de cada dispositivo. */
/* --- RUTX11 ---
enable
configure terminal
hostname RUTX11
no ip domain-lookup

interface GigabitEthernet0/0
 ip address 172.22.100.97 255.255.255.0
 no shutdown
 exit

interface GigabitEthernet0/1
 ip address 192.168.1.1 255.255.255.0
 no shutdown
 exit

interface GigabitEthernet0/2
 ip address 192.168.77.1 255.255.255.0
 no shutdown
 exit

ip route 192.168.88.0 255.255.255.0 192.168.1.201

end
write memory
*/ 
/* --- WLAN-EMULATION-SW ---
enable
configure terminal
hostname WLAN-EMULATION-SW
end
write memory
*/ 
/* --- ROS_CONTROLLER ---
enable
configure terminal
hostname ROS_CONTROLLER
no ip domain-lookup

interface GigabitEthernet0/0
 ip address 192.168.1.201 255.255.255.0
 no shutdown
 exit

interface GigabitEthernet0/1
 ip address 192.168.88.10 255.255.255.0
 no shutdown
 exit

interface GigabitEthernet0/2
 ip address 192.168.77.203 255.255.255.0
 no shutdown
 exit

ip route 0.0.0.0 0.0.0.0 192.168.1.1

end
write memory
*/ 
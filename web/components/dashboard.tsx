"use client";
// Shared operational interface for authenticated users.
import type {ComponentProps,ComponentType} from "react";
import {EquipmentTaskProvider} from "./tasks-dashboard";
import * as Preview from "./dashboard.preview";
export default function Dashboard(props:ComponentProps<typeof Preview.default>) {
 const Component=(Preview.default) as ComponentType<any>;
 return <EquipmentTaskProvider><Component {...(props as any)}/></EquipmentTaskProvider>;
}
export function OrderDetails(props:ComponentProps<typeof Preview.OrderDetails>) {
 const Component=(Preview.OrderDetails) as ComponentType<any>;
 return <EquipmentTaskProvider><Component {...(props as any)}/></EquipmentTaskProvider>;
}

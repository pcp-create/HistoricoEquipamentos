"use client";
// Shared operational interface for authenticated users.
import type {ComponentProps,ComponentType} from "react";
import * as Preview from "./equipment-dashboard.preview";
export default function EquipmentDashboard(props:ComponentProps<typeof Preview.default>) {
 const Component=(Preview.default) as ComponentType<any>;
 return <Component {...(props as any)}/>;
}

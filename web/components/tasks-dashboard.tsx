"use client";
// Shared operational interface for authenticated users.
import type {ComponentProps,ComponentType} from "react";
import * as Preview from "./tasks-dashboard.preview";
export default function TasksDashboard(props:ComponentProps<typeof Preview.default>) {
 const Component=(Preview.default) as ComponentType<any>;
 return <Component {...(props as any)}/>;
}
export function TaskDrawer(props:ComponentProps<typeof Preview.TaskDrawer>) {
 const Component=(Preview.TaskDrawer) as ComponentType<any>;
 return <Component {...(props as any)}/>;
}
export function EquipmentTaskProvider(props:ComponentProps<typeof Preview.EquipmentTaskProvider>) {
 const Component=(Preview.EquipmentTaskProvider) as ComponentType<any>;
 return <Component {...(props as any)}/>;
}
export function EquipmentTaskLinks(props:ComponentProps<typeof Preview.EquipmentTaskLinks>) {
 const Component=(Preview.EquipmentTaskLinks) as ComponentType<any>;
 return <Component {...(props as any)}/>;
}

export function OrderPendingTaskLinks(props:ComponentProps<typeof Preview.OrderPendingTaskLinks>) {
 return <Preview.OrderPendingTaskLinks {...props}/>;
}

"use client";
// Shared operational interface for authenticated users.
import type {ComponentProps,ComponentType} from "react";
import * as Preview from "./task-territories.preview";
export default function TaskTerritories(props:ComponentProps<typeof Preview.default>) {
 const Component=(Preview.default) as ComponentType<any>;
 return <Component {...(props as any)}/>;
}

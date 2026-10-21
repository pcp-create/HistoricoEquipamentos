"use client";
// Shared operational interface for authenticated users.
import type {ComponentProps,ComponentType} from "react";
import * as Preview from "./quote-item-row.preview";
export default function QuoteItemRow(props:ComponentProps<typeof Preview.default>) {
 const Component=(Preview.default) as ComponentType<any>;
 return <Component {...(props as any)}/>;
}

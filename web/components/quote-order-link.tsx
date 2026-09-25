"use client";
import CreateLinkedTask from "./create-linked-task";
import type { QuoteSale } from "@/lib/quotes/types";
export default function QuoteOrderLink({ sale }: { sale: QuoteSale }) {
  const number = sale.orderNumber || sale.order;
  return (
    <>
      <a
        className="quote-order-link"
        href={
          "/?" +
          new URLSearchParams({
            view: "orders",
            company: sale.company,
            orderNumber: number,
          })
        }
        target="_blank"
        rel="noopener noreferrer"
        title="Abrir esta OS no histórico em outra aba"
      >
        OS {number}
      </a>
      <CreateLinkedTask
        orderId={sale.order}
        orderCompany={sale.company}
        number={number}
      />
    </>
  );
}

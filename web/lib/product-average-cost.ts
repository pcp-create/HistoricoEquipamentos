/** Shared by the product catalog and OS material enrichment; scoped by company/product in each query. */
export const productAverageCostSql = `CASE WHEN count(average_cost)=count(*) AND min(average_cost)>=0
  THEN CASE WHEN min(average_cost)=max(average_cost) THEN min(average_cost)
    WHEN count(stock)=count(*) AND min(stock)>=0 AND sum(stock)>0
    THEN sum(average_cost*stock)/sum(stock) END END`;

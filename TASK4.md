# TASK 4: System design

## 1. Likely causes, and what I'd check first

My first suspect is the search query itself. It worked at 1,000 users because the tables fit in memory, so even full scans were cheap. At 50,000 the same query probably scans and sorts on every call: filters on unindexed columns, `LIKE '%term%'`, or an `ORDER BY rating` that ends in a filesort. That pattern is exactly what pins a CPU.

The second suspect is how many queries each search runs. An N+1 loop fetching every artist's profile or rating, or results without a limit, multiplies the load, and nothing is cached.

Before changing anything I'd confirm which one it is. I'd rank statements by total time with the slow query log and `performance_schema.events_statements_summary_by_digest`, then `EXPLAIN ANALYZE` the worst one. APM traces show the queries per request.

## 2. The 48-hour fix

Two changes. First, composite indexes matching the search's filter and sort columns, built online (`ALGORITHM=INPLACE, LOCK=NONE`) so traffic keeps flowing. Second, a Redis cache in front of search, keyed by the normalised query, with a 60-second TTL. Popular searches repeat a lot, so most requests stop reaching MySQL. Neither needs downtime.

## 3. The long-term fix

Search doesn't belong in the transactional database. I'd move it to OpenSearch, fed from MySQL through change data capture, with MySQL staying the source of truth. Search then scales on its own and gets real text matching and facets.

The trade-off is eventual consistency, since a new artist shows up seconds later, plus one more system to run and keep in sync. Search can live with that. Bookings can't, which is why they stay in MySQL.

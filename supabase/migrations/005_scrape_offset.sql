-- Add scrape_offset to competitors for incremental scraping
-- This tracks where we left off so the next cron run continues
-- from where the previous one stopped, ensuring all URLs get scraped.

alter table competitors add column scrape_offset integer not null default 0;

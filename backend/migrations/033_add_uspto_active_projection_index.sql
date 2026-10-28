CREATE INDEX IF NOT EXISTS registry_trademarks_uspto_active_id_idx
  ON public.registry_trademarks (id)
  WHERE source_registry = 'USPTO'
    AND status IN ('registered', 'pending');

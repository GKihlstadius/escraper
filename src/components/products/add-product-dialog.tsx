'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { CATEGORY_LABELS, type ProductCategory } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}

export function AddProductDialog({ open, onOpenChange, onAdded }: Props) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ProductCategory>('övrigt');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, name, category }),
      });

      if (!res.ok) throw new Error('Scraping misslyckades');

      setUrl('');
      setName('');
      setCategory('övrigt');
      onOpenChange(false);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ett fel uppstod');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lägg till produkt</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="url">Produkt-URL</Label>
            <Input
              id="url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.butik.se/produkt..."
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Produktnamn (valfritt)</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Hämtas automatiskt om tomt"
            />
          </div>
          <div className="space-y-2">
            <Label>Kategori</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ProductCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Scrapar...' : 'Lägg till & scrapa'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

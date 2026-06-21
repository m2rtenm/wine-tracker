import React, { useMemo, useState, useEffect } from 'react';
import { COUNTRIES } from '../data/countries';

const DEFAULT_MEMBERS = ['Marten', 'Mirjam', 'Alex', 'Sofia'];

const createEmptyMemberRatings = memberNames =>
  memberNames.reduce((acc, name) => ({ ...acc, [name]: '' }), {});

export default function AddWineForm({ isOpen, onClose, onSave, initialWine, existingWines = [] }) {
  const getTodayDate = () => new Date().toISOString().split('T')[0];

  const memberNames = useMemo(() => {
    const set = new Set();

    existingWines.forEach(wine => {
      if (wine.memberRatings && typeof wine.memberRatings === 'object') {
        Object.keys(wine.memberRatings).forEach(name => set.add(name));
      }
    });

    if (initialWine?.memberRatings && typeof initialWine.memberRatings === 'object') {
      Object.keys(initialWine.memberRatings).forEach(name => set.add(name));
    }

    const names = [...set].sort();
    return names.length ? names : DEFAULT_MEMBERS;
  }, [existingWines, initialWine]);

  const [formState, setFormState] = useState({
    tastedDate: getTodayDate(),
    wineName: '',
    country: '',
    berry: '',
    closureType: 'Screw cap',
    vol: '',
    comment: '',
    memberRatings: createEmptyMemberRatings(DEFAULT_MEMBERS),
  });
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pre-populate form when editing
  useEffect(() => {
    if (initialWine) {
      setFormState({
        tastedDate: initialWine.tastedDate || '',
        wineName: initialWine.wineName || '',
        country: initialWine.country || '',
        berry: initialWine.berry || '',
        closureType: initialWine.closureType || 'Screw cap',
        vol: initialWine.vol || '',
        comment: initialWine.comment || '',
        memberRatings: memberNames.reduce((acc, name) => ({
          ...acc,
          [name]: initialWine.memberRatings?.[name] || '',
        }), {}),
      });
      setFile(null);
      setStatus('');
    } else {
      setFormState({
        tastedDate: getTodayDate(),
        wineName: '',
        country: '',
        berry: '',
        closureType: 'Screw cap',
        vol: '',
        comment: '',
        memberRatings: createEmptyMemberRatings(memberNames),
      });
      setFile(null);
      setStatus('');
    }
  }, [isOpen, initialWine, memberNames]);

  const groupAverage = useMemo(() => {
    const validRatings = memberNames
      .map(name => String(formState.memberRatings[name] ?? '').trim())
      .filter(value => value !== '')
      .map(value => Number(value))
      .filter(value => !Number.isNaN(value));

    if (!validRatings.length) return 0;
    return Number((validRatings.reduce((sum, value) => sum + value, 0) / validRatings.length).toFixed(2));
  }, [formState.memberRatings, memberNames]);

  const handleFieldChange = event => {
    const { name, value } = event.target;
    setFormState(prev => ({ ...prev, [name]: value }));
  };

  const handleRatingChange = (member, value) => {
    setFormState(prev => ({
      ...prev,
      memberRatings: {
        ...prev.memberRatings,
        [member]: value,
      },
    }));
  };

  const handleFileChange = event => {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
  };

  const generateWineId = date => {
    const normalizedDate = date.replace(/-/g, '');
    const existingForDate = existingWines.filter(wine => wine.tastedDate === date);
    const maxSequence = existingForDate.reduce((max, wine) => {
      const match = wine.wineId?.match(new RegExp(`^${normalizedDate}-(\\d+)$`));
      const sequence = match ? Number(match[1]) : 0;
      return Number.isNaN(sequence) ? max : Math.max(max, sequence);
    }, 0);

    return `${normalizedDate}-${maxSequence + 1}`;
  };

  const toUploadPayload = selectedFile => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const dataBase64 = result.includes(',') ? result.split(',')[1] : '';
      if (!dataBase64) {
        reject(new Error('Failed to read selected image file.'));
        return;
      }

      resolve({
        fileName: selectedFile.name,
        contentType: selectedFile.type || 'application/octet-stream',
        dataBase64,
      });
    };
    reader.onerror = () => reject(new Error('Failed to read selected image file.'));
    reader.readAsDataURL(selectedFile);
  });

  const handleSubmit = async event => {
    event.preventDefault();
    const isEditing = !!initialWine;

    const wineId = initialWine?.wineId || generateWineId(formState.tastedDate);
    setIsSubmitting(true);

    try {
      setStatus(isEditing ? 'Updating wine record...' : 'Saving wine record...');

      const memberRatings = memberNames.reduce((acc, name) => {
        const rawValue = String(formState.memberRatings[name] ?? '').trim();
        if (rawValue === '') return acc;

        const rating = Number(rawValue);
        if (Number.isNaN(rating)) return acc;

        acc[name] = rating;
        return acc;
      }, {});

      const payload = {
        wineId,
        tastedDate: formState.tastedDate,
        wineName: formState.wineName,
        country: formState.country,
        berry: formState.berry,
        closureType: formState.closureType,
        vol: Number(formState.vol) || 0,
        imageUrl: initialWine?.imageUrl ?? '',
        comment: formState.comment,
        groupAverage,
        memberRatings,
      };

      if (file) {
        payload.uploadImage = await toUploadPayload(file);
      }

      const savedWine = typeof onSave === 'function' ? await onSave(payload, { isEditing }) : payload;

      setStatus(isEditing ? 'Wine entry updated successfully.' : 'Wine entry saved successfully.');
      setFormState({
        tastedDate: getTodayDate(),
        wineName: '',
        country: '',
        berry: '',
        closureType: 'Screw cap',
        vol: '',
        comment: '',
        memberRatings: createEmptyMemberRatings(memberNames),
      });
      setFile(null);
      if (savedWine) {
        onClose();
      }
    } catch (error) {
      console.error(error);
      setStatus(error?.message || 'Failed to save wine entry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const isEditing = !!initialWine;
  const formTitle = isEditing ? 'Edit Wine' : 'Add New Wine';
  const formDescription = isEditing ? 'Update wine details and metadata.' : 'Upload image and save tasting metadata.';
  const submitButtonText = isEditing ? 'Update Wine' : 'Save Wine';

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60">
      <div className="absolute inset-0" onClick={onClose} />
      <section className="relative right-0 ml-auto flex h-full w-full max-w-3xl flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{formTitle}</h2>
            <p className="mt-1 text-sm text-slate-500">{formDescription}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-slate-100 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-200"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 px-6 py-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Tasted Date</span>
              <input
                type="date"
                name="tastedDate"
                value={formState.tastedDate}
                onChange={handleFieldChange}
                required
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Wine Name</span>
              <input
                type="text"
                name="wineName"
                value={formState.wineName}
                onChange={handleFieldChange}
                placeholder="e.g. Marlborough Sauvignon Blanc"
                required
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Country</span>
              <select
                name="country"
                value={formState.country}
                onChange={handleFieldChange}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
              >
                <option value="">— Select country —</option>
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.name}>{c.flag} {c.name}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Berry / Grape</span>
              <input
                type="text"
                name="berry"
                value={formState.berry}
                onChange={handleFieldChange}
                placeholder="e.g. Chardonnay, Sauvignon Blanc"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Closure Type</span>
              <select
                name="closureType"
                value={formState.closureType}
                onChange={handleFieldChange}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
              >
                <option>Screw cap</option>
                <option>Cork</option>
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">ABV / Vol (%)</span>
              <input
                type="number"
                name="vol"
                step="0.1"
                min="0"
                value={formState.vol}
                onChange={handleFieldChange}
                placeholder="e.g. 13.5"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Bottle Image (Optional)</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Tasting Notes</span>
            <textarea
              name="comment"
              value={formState.comment}
              onChange={handleFieldChange}
              rows="4"
              placeholder="Describe the aroma, texture, and finish."
              className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
            />
          </label>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="mb-4 text-sm font-semibold text-slate-800">Member Ratings</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {memberNames.map(member => (
                <label key={member} className="block">
                  <span className="text-sm font-medium text-slate-700">{member}</span>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    step="0.5"
                    value={formState.memberRatings[member]}
                    onChange={event => handleRatingChange(member, event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500"
                  />
                </label>
              ))}
            </div>
            <p className="mt-4 text-sm text-slate-600">
              Calculated group average: <span className="font-semibold text-slate-900">{groupAverage.toFixed(2)}</span>
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">{isEditing ? 'Update wine metadata in DynamoDB.' : 'Upload your image to S3 and write the wine metadata into DynamoDB.'}</p>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                {isSubmitting ? 'Saving...' : submitButtonText}
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
          {status && <p className="text-sm text-slate-600">{status}</p>}
        </form>
      </section>
    </div>
  );
}

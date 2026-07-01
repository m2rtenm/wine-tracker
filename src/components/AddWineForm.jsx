import { useMemo, useState, useRef } from 'react';
import { COUNTRIES } from '../data/countries';

const DEFAULT_MEMBERS = ['Marten', 'Mirjam', 'Alex', 'Sofia'];
const CLOSURE_PRESETS = ['Screw cap', 'Cork'];
const DRINK_TYPE_PRESETS = ['Wine'];
const MAX_IMAGE_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1920;
const JPEG_QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55, 0.45];

const createEmptyMemberRatings = memberNames =>
  memberNames.reduce((acc, name) => ({ ...acc, [name]: '' }), {});

const formatBytes = bytes => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const readFileAsDataUrl = fileOrBlob => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = typeof reader.result === 'string' ? reader.result : '';
    const dataBase64 = result.includes(',') ? result.split(',')[1] : '';
    if (!dataBase64) {
      reject(new Error('Failed to read selected image file.'));
      return;
    }
    resolve(dataBase64);
  };
  reader.onerror = () => reject(new Error('Failed to read selected image file.'));
  reader.readAsDataURL(fileOrBlob);
});

const loadImageFromFile = file => new Promise((resolve, reject) => {
  const image = new Image();
  const objectUrl = URL.createObjectURL(file);

  image.onload = () => {
    URL.revokeObjectURL(objectUrl);
    resolve(image);
  };

  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error('Failed to load selected image file.'));
  };

  image.src = objectUrl;
});

const canvasToBlob = (canvas, quality) => new Promise(resolve => {
  canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality);
});

const ensureJpegFileName = originalName => {
  const base = (originalName || 'image').replace(/\.[^/.]+$/, '');
  return `${base || 'image'}.jpg`;
};

const toUploadPayload = async selectedFile => {
  if (!selectedFile?.type?.startsWith('image/')) {
    const dataBase64 = await readFileAsDataUrl(selectedFile);
    return {
      fileName: selectedFile.name,
      contentType: selectedFile.type || 'application/octet-stream',
      dataBase64,
      optimizedBytes: selectedFile.size,
    };
  }

  let image;
  try {
    image = await loadImageFromFile(selectedFile);
  } catch {
    const dataBase64 = await readFileAsDataUrl(selectedFile);
    return {
      fileName: selectedFile.name,
      contentType: selectedFile.type || 'application/octet-stream',
      dataBase64,
      optimizedBytes: selectedFile.size,
    };
  }

  const baseScale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height));
  let scaleMultiplier = 1;
  let bestBlob = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const width = Math.max(1, Math.round(image.width * baseScale * scaleMultiplier));
    const height = Math.max(1, Math.round(image.height * baseScale * scaleMultiplier));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) break;

    context.drawImage(image, 0, 0, width, height);

    for (const quality of JPEG_QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, quality);
      if (!blob) continue;

      if (!bestBlob || blob.size < bestBlob.size) {
        bestBlob = blob;
      }

      if (blob.size <= MAX_IMAGE_UPLOAD_BYTES) {
        const dataBase64 = await readFileAsDataUrl(blob);
        return {
          fileName: ensureJpegFileName(selectedFile.name),
          contentType: 'image/jpeg',
          dataBase64,
          optimizedBytes: blob.size,
        };
      }
    }

    scaleMultiplier *= 0.85;
  }

  if (!bestBlob) {
    const dataBase64 = await readFileAsDataUrl(selectedFile);
    return {
      fileName: selectedFile.name,
      contentType: selectedFile.type || 'application/octet-stream',
      dataBase64,
      optimizedBytes: selectedFile.size,
    };
  }

  const dataBase64 = await readFileAsDataUrl(bestBlob);
  return {
    fileName: ensureJpegFileName(selectedFile.name),
    contentType: 'image/jpeg',
    dataBase64,
    optimizedBytes: bestBlob.size,
  };
};

const toInitialClosureFields = value => {
  const closureValue = String(value || '').trim();
  if (!closureValue) {
    return { closureType: 'Screw cap', customClosureType: '' };
  }

  if (CLOSURE_PRESETS.includes(closureValue)) {
    return { closureType: closureValue, customClosureType: '' };
  }

  return { closureType: 'Other', customClosureType: closureValue };
};

const toInitialDrinkTypeFields = value => {
  const drinkTypeValue = String(value || '').trim();
  if (!drinkTypeValue) {
    return { drinkType: 'Wine', customDrinkType: '' };
  }

  if (DRINK_TYPE_PRESETS.includes(drinkTypeValue)) {
    return { drinkType: drinkTypeValue, customDrinkType: '' };
  }

  return { drinkType: 'Other', customDrinkType: drinkTypeValue };
};

const createInitialFormState = (initialWine, memberNames, getTodayDate) => {
  const closureFields = toInitialClosureFields(initialWine?.closureType);
  const drinkTypeFields = toInitialDrinkTypeFields(initialWine?.drinkType);

  if (initialWine) {
    return {
      tastedDate: initialWine.tastedDate || '',
      wineName: initialWine.wineName || '',
      country: initialWine.country || '',
      berry: initialWine.berry || '',
      drinkType: drinkTypeFields.drinkType,
      customDrinkType: drinkTypeFields.customDrinkType,
      closureType: closureFields.closureType,
      customClosureType: closureFields.customClosureType,
      vol: initialWine.vol || '',
      comment: initialWine.comment || '',
      memberRatings: memberNames.reduce((acc, name) => ({
        ...acc,
        [name]: initialWine.memberRatings?.[name] || '',
      }), {}),
    };
  }

  return {
    tastedDate: getTodayDate(),
    wineName: '',
    country: '',
    berry: '',
    drinkType: 'Wine',
    customDrinkType: '',
    closureType: 'Screw cap',
    customClosureType: '',
    vol: '',
    comment: '',
    memberRatings: createEmptyMemberRatings(memberNames),
  };
};

export default function AddWineForm({ isOpen, onClose, onSave, initialWine, existingWines = [] }) {
  const getTodayDate = () => new Date().toISOString().split('T')[0];
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

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

  const [formState, setFormState] = useState(() => createInitialFormState(initialWine, memberNames, getTodayDate));
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    setFormState(prev => {
      if (name === 'drinkType') {
        return {
          ...prev,
          drinkType: value,
          customDrinkType: value === 'Other' ? prev.customDrinkType : '',
        };
      }

      if (name === 'closureType') {
        return {
          ...prev,
          closureType: value,
          customClosureType: value === 'Other' ? prev.customClosureType : '',
        };
      }

      return { ...prev, [name]: value };
    });
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
    if (selectedFile) {
      setStatus(`Selected image: ${selectedFile.name} (${formatBytes(selectedFile.size)}).`);
    }

    // Allow selecting the same file again when using camera/gallery repeatedly.
    event.target.value = '';
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

      const normalizedClosureType = formState.closureType === 'Other'
        ? formState.customClosureType.trim()
        : formState.closureType;
      const normalizedDrinkType = formState.drinkType === 'Other'
        ? formState.customDrinkType.trim()
        : formState.drinkType;

      if (!normalizedClosureType) {
        throw new Error('Please provide a closure type.');
      }

      if (!normalizedDrinkType) {
        throw new Error('Please provide a drink type.');
      }

      const payload = {
        wineId,
        tastedDate: formState.tastedDate,
        wineName: formState.wineName,
        country: formState.country,
        berry: formState.berry,
        drinkType: normalizedDrinkType,
        closureType: normalizedClosureType,
        vol: Number(formState.vol) || 0,
        imageUrl: initialWine?.imageUrl ?? '',
        comment: formState.comment,
        groupAverage,
        memberRatings,
      };

      if (file) {
        setStatus('Optimizing image for upload...');
        payload.uploadImage = await toUploadPayload(file);
        setStatus(`Image optimized to ${formatBytes(payload.uploadImage.optimizedBytes)}.`);
      }

      const savedWine = typeof onSave === 'function' ? await onSave(payload, { isEditing }) : payload;

      setStatus(isEditing ? 'Wine entry updated successfully.' : 'Wine entry saved successfully.');
      setFormState(createInitialFormState(null, memberNames, getTodayDate));
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
                className="mt-2 w-full min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
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
              <input
                list="country-options"
                type="text"
                name="country"
                value={formState.country}
                onChange={handleFieldChange}
                placeholder="Type to filter countries..."
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
              />
              <datalist id="country-options">
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.name} />
                ))}
              </datalist>
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
              <span className="text-sm font-semibold text-slate-700">Drink Type</span>
              <select
                name="drinkType"
                value={formState.drinkType}
                onChange={handleFieldChange}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
              >
                <option>Wine</option>
                <option>Other</option>
              </select>
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
                <option>Other</option>
              </select>
            </label>
          </div>

          {formState.drinkType === 'Other' && (
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Custom Drink Type</span>
              <input
                type="text"
                name="customDrinkType"
                value={formState.customDrinkType}
                onChange={handleFieldChange}
                required
                placeholder="e.g. Cider, Mead, Hard seltzer"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
              />
            </label>
          )}

          {formState.closureType === 'Other' && (
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Custom Closure Type</span>
              <input
                type="text"
                name="customClosureType"
                value={formState.customClosureType}
                onChange={handleFieldChange}
                required
                placeholder="e.g. Crown cap, synthetic cork, swing-top"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
              />
            </label>
          )}

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

            <div className="block">
              <span className="text-sm font-semibold text-slate-700">Bottle Image (Optional)</span>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Take Photo
                </button>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Choose from Gallery
                </button>
              </div>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              {file && <p className="mt-2 text-xs text-slate-500">Selected file: {file.name}</p>}
            </div>
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

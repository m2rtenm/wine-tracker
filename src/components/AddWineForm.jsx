import React, { useMemo, useState, useEffect } from 'react';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

const REGION = 'eu-north-1';
const S3_BUCKET = 'wine-tracker-media';
const DDB_TABLE = 'WineTracker';
const MEMBERS = ['Marten', 'Mirjam', 'Alex', 'Sofia'];

export default function AddWineForm({ isOpen, onClose, onSave, initialWine, existingWines = [] }) {
  const getTodayDate = () => new Date().toISOString().split('T')[0];

  const [formState, setFormState] = useState({
    tastedDate: getTodayDate(),
    wineName: '',
    country: '',
    closureType: 'Screw cap',
    vol: '',
    comment: '',
    memberRatings: MEMBERS.reduce((acc, name) => ({ ...acc, [name]: '' }), {}),
  });
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');

  // Pre-populate form when editing
  useEffect(() => {
    if (initialWine) {
      setFormState({
        tastedDate: initialWine.tastedDate || '',
        wineName: initialWine.wineName || '',
        country: initialWine.country || '',
        closureType: initialWine.closureType || 'Screw cap',
        vol: initialWine.vol || '',
        comment: initialWine.comment || '',
        memberRatings: MEMBERS.reduce((acc, name) => ({
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
        closureType: 'Screw cap',
        vol: '',
        comment: '',
        memberRatings: MEMBERS.reduce((acc, name) => ({ ...acc, [name]: '' }), {}),
      });
      setFile(null);
      setStatus('');
    }
  }, [isOpen, initialWine]);

  const groupAverage = useMemo(() => {
    const ratings = MEMBERS.map(name => Number(formState.memberRatings[name] || 0));
    const validRatings = ratings.filter(value => !Number.isNaN(value));
    if (!validRatings.length) return 0;
    return Number((validRatings.reduce((sum, value) => sum + value, 0) / validRatings.length).toFixed(2));
  }, [formState.memberRatings]);

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

  const handleSubmit = async event => {
    event.preventDefault();
    const isEditing = !!initialWine;

    if (!isEditing && !file) {
      setStatus('Please select a bottle image before submitting.');
      return;
    }

    const wineId = initialWine?.wineId || generateWineId(formState.tastedDate);
    let imageUrl = initialWine?.imageUrl;

    try {
      // Upload image if a new file is provided
      if (file) {
        setStatus('Uploading image to S3...');
        const objectKey = `uploads/${wineId}/${file.name}`;
        const s3Client = new S3Client({ region: REGION });

        await s3Client.send(
          new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: objectKey,
            Body: file,
            ContentType: file.type,
          })
        );

        imageUrl = `https://${S3_BUCKET}.s3.${REGION}.amazonaws.com/${objectKey}`;
      }

      setStatus(isEditing ? 'Updating wine record...' : 'Saving record to DynamoDB...');
      const dynamoClient = new DynamoDBClient({ region: REGION });
      const item = {
        wineId: { S: wineId },
        tastedDate: { S: formState.tastedDate },
        wineName: { S: formState.wineName },
        country: { S: formState.country },
        closureType: { S: formState.closureType },
        vol: { N: String(Number(formState.vol) || 0) },
        imageUrl: { S: imageUrl },
        comment: { S: formState.comment },
        groupAverage: { N: String(groupAverage) },
        memberRatings: {
          M: MEMBERS.reduce((acc, name) => {
            const rating = Number(formState.memberRatings[name] || 0);
            return {
              ...acc,
              [name]: { N: String(Number.isNaN(rating) ? 0 : rating) },
            };
          }, {}),
        },
      };

      await dynamoClient.send(new PutItemCommand({ TableName: DDB_TABLE, Item: item }));

      const newWine = {
        wineId,
        tastedDate: formState.tastedDate,
        wineName: formState.wineName,
        country: formState.country,
        closureType: formState.closureType,
        vol: Number(formState.vol) || 0,
        imageUrl,
        comment: formState.comment,
        groupAverage,
        memberRatings: MEMBERS.reduce((acc, name) => {
          const rating = Number(formState.memberRatings[name] || 0);
          acc[name] = Number.isNaN(rating) ? 0 : rating;
          return acc;
        }, {}),
      };

      if (typeof onSave === 'function') {
        onSave(newWine);
      }

      setStatus(isEditing ? 'Wine entry updated successfully.' : 'Wine entry saved successfully.');
      setFormState({
        tastedDate: '',
        wineName: '',
        country: '',
        closureType: 'Screw cap',
        vol: '',
        comment: '',
        memberRatings: MEMBERS.reduce((acc, name) => ({ ...acc, [name]: '' }), {}),
      });
      setFile(null);
      onClose();
    } catch (error) {
      console.error(error);
      setStatus('Failed to save wine entry. Check your AWS credentials and bucket policy.');
    }
  };

  if (!isOpen) return null;

  const isEditing = !!initialWine;
  const formTitle = isEditing ? 'Edit Wine' : 'Add New Wine';
  const formDescription = isEditing ? 'Update wine details and metadata.' : 'Upload image and submit tasting metadata to DynamoDB.';
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
              <input
                type="text"
                name="country"
                value={formState.country}
                onChange={handleFieldChange}
                placeholder="e.g. New Zealand"
                required
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
                required
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-700">{isEditing ? 'Bottle Image (Optional)' : 'Bottle Image'}</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                required={!isEditing}
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
              required
              className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
            />
          </label>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="mb-4 text-sm font-semibold text-slate-800">Member Ratings</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {MEMBERS.map(member => (
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
                    required
                  />
                </label>
              ))}
            </div>
            <p className="mt-4 text-sm text-slate-600">
              Calculated group average: <span className="font-semibold text-slate-900">{groupAverage}</span>
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
            <p className="text-sm text-slate-500">{isEditing ? 'Update wine metadata in DynamoDB.' : 'Upload your image to S3 and write the wine metadata into DynamoDB.'}</p>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
            >
              {submitButtonText}
            </button>
          </div>
          {status && <p className="text-sm text-slate-600">{status}</p>}
        </form>
      </section>
    </div>
  );
}

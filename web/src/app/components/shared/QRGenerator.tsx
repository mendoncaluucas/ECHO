import { useState } from 'react';
import { QrCode, Download } from 'lucide-react';

export function QRGenerator() {
  const [selectedArea, setSelectedArea] = useState('');
  const [generatedQR, setGeneratedQR] = useState<string | null>(null);

  const areas = ['Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4', 'Área VIP', 'Balcão', 'Terraço'];

  const generateQR = () => {
    const uuid = crypto.randomUUID();
    setGeneratedQR(uuid);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-8">
      <div className="max-w-3xl mx-auto">
        <div className="pt-6 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Gerador de QR Code</h1>
          <p className="text-gray-600 mt-1">Crie códigos para mesas e áreas</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Selecionar Área/Mesa
            </label>
            <select
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-700"
            >
              <option value="">Escolha uma área...</option>
              {areas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={generateQR}
            disabled={!selectedArea}
            className={`w-full py-4 px-6 rounded-xl font-semibold transition-colors shadow-md flex items-center justify-center gap-2 ${
              selectedArea
                ? 'bg-gray-700 hover:bg-gray-800 text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            <QrCode className="w-5 h-5" />
            Gerar QR Code
          </button>

          {generatedQR && (
            <div className="mt-8 space-y-6 border-t pt-8">
              <div className="text-center">
                <h3 className="text-lg font-bold text-gray-900 mb-4">QR Code Gerado</h3>
                <div className="inline-block bg-white p-8 rounded-2xl border-4 border-gray-200">
                  <div className="w-64 h-64 bg-gray-100 rounded-xl flex items-center justify-center">
                    <div className="grid grid-cols-8 gap-1">
                      {Array.from({ length: 64 }).map((_, i) => (
                        <div
                          key={i}
                          className={`w-6 h-6 ${
                            Math.random() > 0.5 ? 'bg-gray-900' : 'bg-white'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm font-semibold text-gray-700 mb-1">UUID Gerado:</p>
                <p className="text-xs text-gray-600 font-mono break-all">{generatedQR}</p>
              </div>

              <div className="bg-teal-50 rounded-xl p-4">
                <p className="text-sm font-semibold text-teal-900 mb-1">Área Associada:</p>
                <p className="text-teal-700 font-semibold">{selectedArea}</p>
              </div>

              <button className="w-full bg-teal-600 hover:bg-teal-700 text-white py-4 px-6 rounded-xl font-semibold transition-colors shadow-md hover:shadow-lg flex items-center justify-center gap-2">
                <Download className="w-5 h-5" />
                Baixar QR Code
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

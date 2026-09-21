import { useEffect, useState } from 'react';
import { QrCode, Download, Loader2 } from 'lucide-react';
import {
  gerarQRCode,
  listarAreas,
  type Area,
  type QRCodeGerado,
} from '../../services/api';

export function QRGenerator() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [selectedArea, setSelectedArea] = useState('');
  const [gerado, setGerado] = useState<QRCodeGerado | null>(null);
  const [carregandoAreas, setCarregandoAreas] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;

    listarAreas()
      .then((res) => {
        if (ativo) setAreas(res.itens);
      })
      .catch((e: Error) => {
        if (ativo) setErro(e.message || 'Não foi possível carregar as áreas.');
      })
      .finally(() => {
        if (ativo) setCarregandoAreas(false);
      });

    return () => {
      ativo = false;
    };
  }, []);

  const handleGerar = async () => {
    setErro(null);
    setGerando(true);
    try {
      setGerado(await gerarQRCode(selectedArea));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gerar o QR Code.');
    } finally {
      setGerando(false);
    }
  };

  const nomeDaArea = areas.find((a) => a.id === selectedArea)?.nome ?? '';

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
              disabled={carregandoAreas || areas.length === 0}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-700 disabled:bg-gray-100"
            >
              <option value="">
                {carregandoAreas
                  ? 'Carregando áreas...'
                  : areas.length === 0
                    ? 'Nenhuma área cadastrada'
                    : 'Escolha uma área...'}
              </option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.nome}
                </option>
              ))}
            </select>
          </div>

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {erro}
            </p>
          )}

          <button
            onClick={handleGerar}
            disabled={!selectedArea || gerando}
            className={`w-full py-4 px-6 rounded-xl font-semibold transition-colors shadow-md flex items-center justify-center gap-2 ${
              selectedArea && !gerando
                ? 'bg-gray-700 hover:bg-gray-800 text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {gerando ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <QrCode className="w-5 h-5" />
                Gerar QR Code
              </>
            )}
          </button>

          {gerado && (
            <div className="mt-8 space-y-6 border-t pt-8">
              <div className="text-center">
                <h3 className="text-lg font-bold text-gray-900 mb-4">QR Code Gerado</h3>
                <div className="inline-block bg-white p-8 rounded-2xl border-4 border-gray-200">
                  <img
                    src={gerado.imagem}
                    alt={`QR Code de ${nomeDaArea}`}
                    className="w-64 h-64"
                  />
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm font-semibold text-gray-700 mb-1">Link do formulário:</p>
                <p className="text-xs text-gray-600 font-mono break-all">{gerado.url}</p>
              </div>

              <div className="bg-teal-50 rounded-xl p-4">
                <p className="text-sm font-semibold text-teal-900 mb-1">Área Associada:</p>
                <p className="text-teal-700 font-semibold">{nomeDaArea}</p>
              </div>

              <a
                href={gerado.imagem}
                download={`qrcode-${gerado.token}.png`}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white py-4 px-6 rounded-xl font-semibold transition-colors shadow-md hover:shadow-lg flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                Baixar QR Code
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

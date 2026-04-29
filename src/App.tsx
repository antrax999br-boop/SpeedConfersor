/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Lock, 
  User, 
  Key, 
  ArrowRight, 
  CheckCircle2, 
  Bell, 
  UserCircle, 
  Upload, 
  ShieldCheck, 
  Zap, 
  Cpu, 
  FileText, 
  RefreshCw,
  Download,
  XCircle,
  FileIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from './lib/supabase';

type Screen = 'login' | 'home' | 'processing' | 'success';

export default function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const [file, setFile] = useState<File | null>(null);
  const [ofxBlob, setOfxBlob] = useState<Blob | null>(null);
  const [transactionCount, setTransactionCount] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setScreen('home');
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setScreen('home');
      else setScreen('login');
    });

    return () => subscription.unsubscribe();
  }, []);

  const navigateTo = (newScreen: Screen) => {
    setScreen(newScreen);
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col selection:bg-secondary/30">
      {/* TopAppBar - Not shown on Login as per UX flow in images */}
      {screen !== 'login' && (
        <header className="fixed top-0 left-0 right-0 z-50 bg-surface/60 backdrop-blur-xl border-b border-white/5 shadow-sm">
          <div className="max-w-7xl mx-auto px-6 py-3 flex justify-between items-center">
            <div 
              className="text-lg font-black tracking-tighter text-on-surface cursor-pointer uppercase"
              onClick={() => navigateTo('home')}
            >
              Converter OFX Fluxo
            </div>
            <nav className="hidden md:flex items-center gap-8 text-sm font-medium tracking-tight">
              {['Features', 'How it Works', 'Pricing', 'Support'].map((item) => (
                <a 
                  key={item} 
                  href="#" 
                  className="text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  {item}
                </a>
              ))}
            </nav>
            <div className="flex items-center gap-4">
              <button 
                className="bg-primary-container text-on-primary-container px-4 py-2 rounded-lg font-bold text-sm active:scale-95 transition-all hover:opacity-90 shadow-lg shadow-primary-container/20"
                onClick={() => navigateTo('home')}
              >
                Upload Arquivo
              </button>
              <button onClick={() => supabase.auth.signOut()} className="text-on-surface-variant hover:text-error transition-colors flex items-center gap-2 text-sm font-bold">
                Sair
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Login Header (Special Case) */}
      {screen === 'login' && (
        <header className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-md flex justify-between items-center w-full px-6 py-4 border-b border-violet-900/20">
          <div className="font-bold tracking-widest text-violet-500 uppercase text-xl">
            Fluxo Converter
          </div>
          <div className="flex items-center gap-4">
            <Bell className="w-5 h-5 text-on-surface-variant cursor-pointer hover:text-secondary transition-colors" />
            <UserCircle className="w-6 h-6 text-on-surface-variant cursor-pointer hover:text-secondary transition-colors" />
          </div>
        </header>
      )}

      <main className="flex-grow flex flex-col relative overflow-hidden pt-16">
        <AnimatePresence mode="wait">
          {screen === 'login' && <LoginScreen onLogin={() => navigateTo('home')} />}
          {screen === 'home' && <HomeScreen onUpload={(f) => { setFile(f); navigateTo('processing'); }} />}
          {screen === 'processing' && <ProcessingScreen file={file} onCancel={() => navigateTo('home')} onSuccess={(blob, count) => { setOfxBlob(blob); setTransactionCount(count); navigateTo('success'); }} />}
          {screen === 'success' && <SuccessScreen ofxBlob={ofxBlob} file={file} transactionCount={transactionCount} onReset={() => navigateTo('home')} />}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="bg-surface-container-lowest border-t border-white/5 mt-auto">
        <div className="max-w-7xl mx-auto px-8 py-12 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-xs text-on-surface-variant uppercase tracking-widest text-center md:text-left">
            © 2024 Converter OFX Fluxo. Technical Precision in Finance.
          </div>
          <div className="flex gap-6 flex-wrap justify-center">
            {['Privacy Policy', 'Terms of Service', 'API Documentation', 'Contact'].map((link) => (
              <a 
                key={link} 
                href="#" 
                className="text-xs text-on-surface-variant uppercase tracking-widest hover:text-primary transition-colors"
              >
                {link}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;
        setError('Conta criada! Verifique seu email se necessário, ou já está logado.');
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        // onAuthStateChange vai mudar a tela automaticamente
      }
    } catch (err: any) {
      setError(err.message || 'Erro de autenticação');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="min-h-screen flex items-center justify-center tech-pattern p-6"
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-container/10 blur-[120px] rounded-full pointer-events-none" />
      
      <div className="relative z-10 w-full max-w-[440px]">
        <div className="glass-card rounded-xl p-8 shadow-2xl">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-container/20 border border-primary/20 mb-4 shadow-[0_0_20px_rgba(98,0,238,0.2)]">
              <Lock className="text-secondary w-8 h-8" />
            </div>
            <h1 className="text-2xl font-semibold text-on-surface mb-1">
              {isSignUp ? 'Criar Conta' : 'Welcome Back'}
            </h1>
            <p className="text-sm text-on-surface-variant uppercase tracking-wider font-medium opacity-80">Command your financial data flow</p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {error && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="p-3 bg-error/10 border border-error/20 rounded-lg text-error text-xs font-semibold text-center"
              >
                {error}
              </motion.div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-on-surface-variant uppercase tracking-widest block" htmlFor="email">Email</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-outline w-5 h-5" />
                <input 
                  type="email" 
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#1E1E22] border border-outline-variant/30 rounded-lg py-3 pl-10 pr-4 text-on-surface focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container transition-all"
                  placeholder="seu@email.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-on-surface-variant uppercase tracking-widest block" htmlFor="password">Password</label>
                <a href="#" className="text-xs text-primary hover:text-secondary transition-colors">Forgot Password?</a>
              </div>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-outline w-5 h-5" />
                <input 
                  type="password" 
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#1E1E22] border border-outline-variant/30 rounded-lg py-3 pl-10 pr-4 text-on-surface focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <div className="flex items-center gap-2 py-2">
              <input type="checkbox" id="remember" className="w-4 h-4 rounded bg-[#1E1E22] border-outline-variant focus:ring-secondary text-secondary" />
              <label htmlFor="remember" className="text-xs font-medium text-on-surface-variant">Stay logged in for 30 days</label>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-primary-container hover:bg-inverse-primary text-white font-bold rounded-lg shadow-lg shadow-primary-container/20 transition-all flex items-center justify-center gap-2 group active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? 'Processando...' : (isSignUp ? 'Criar Conta' : 'Sign In to Fluxo')}
              {!loading && <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-outline-variant/20 text-center">
            <p className="text-sm text-on-surface-variant">
              {isSignUp ? 'Já tem uma conta?' : 'Don\'t have an account?'}
              <button 
                onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
                className="text-secondary font-semibold hover:underline ml-2"
              >
                {isSignUp ? 'Faça Login' : 'Create Account'}
              </button>
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-center gap-6 opacity-40 uppercase text-[10px] tracking-[0.2em] font-bold">
          <div className="flex items-center gap-1">
            <ShieldCheck className="w-4 h-4" /> SECURE CONVERSION
          </div>
          <div className="flex items-center gap-1">
            <Lock className="w-4 h-4" /> AES-256 BANK GRADE
          </div>
        </div>
      </div>

      <div className="fixed right-[-100px] bottom-[-50px] w-[500px] h-[500px] opacity-10 pointer-events-none hidden lg:block">
        <img 
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuC-Y-cZqPPkSQCrGrh_7wWqSBcBEYlSXx29SE6-TpO8SGenqg1x1ptRjIS92quQPc1b9BD8sORQQAUfqHnVEY1-JmLDT2kQF39eUvg1kZFbdUBVmB3HbOyHo5iEDp1AQy3sP7ZLTwC1-eFLMIiCjd52c0msAs3dvAOTG4sxXUFddguaNv8bQAqYwTWj-PE_aG0GLHWAtBtfPg9TOqI8d9elCV2FMtawNIJN0fXVeUpEK6XqFSZBTg7JcEDO6qMscvpvhjyaXOSn2DbX" 
          alt="Abstract Tech Vision"
          className="w-full h-full object-contain"
        />
      </div>
    </motion.div>
  );
}

function HomeScreen({ onUpload }: { onUpload: (f: File) => void }) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUpload(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pb-24"
    >
      <section className="relative px-6 py-20 max-w-7xl mx-auto text-center">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary-container/20 rounded-full blur-[100px]" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-secondary/10 rounded-full blur-[100px]" />

        <div className="relative z-10 space-y-8 max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-black text-on-surface leading-tight tracking-tight">
            Converta <span className="text-secondary">Extratos</span> para <span className="text-primary">OFX</span> <br />
            <span className="italic">instantaneamente</span>
          </h1>
          <p className="text-lg text-on-surface-variant max-w-2xl mx-auto leading-relaxed">
            Transforme seus extratos bancários em PDF para o formato OFX de forma rápida, segura e gratuita. O fluxo perfeito para sua gestão financeira.
          </p>

          <input 
            type="file" 
            accept="application/pdf,text/csv,text/plain" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
          />
          <div 
            className="mt-12 relative group cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-primary-container to-secondary rounded-xl blur opacity-25 group-hover:opacity-40 transition duration-1000" />
            <div className="relative glass-card border-2 border-dashed border-primary-container/30 rounded-xl p-16 radial-halo flex flex-col items-center hover:border-secondary/50 transition-colors">
              <div className="w-20 h-20 bg-surface-container-highest rounded-full flex items-center justify-center mb-6 border border-white/5 shadow-[0_0_30px_rgba(70,245,224,0.1)]">
                <Upload className="w-10 h-10 text-secondary" />
              </div>
              <h3 className="text-2xl font-semibold text-on-surface mb-2">Arraste seu arquivo aqui ou clique para selecionar</h3>
              <p className="text-sm text-on-surface-variant font-medium uppercase tracking-widest opacity-60">Arquivos suportados: PDF, CSV, TXT (Máximo 10MB)</p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-12 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <FeatureCard 
            icon={<ShieldCheck className="text-primary w-8 h-8" />}
            title="Segurança"
            desc="Seus dados são processados localmente ou em sessões criptografadas. Nunca armazenamos suas informações financeiras."
            borderColor="border-l-primary"
          />
          <FeatureCard 
            icon={<Zap className="text-secondary w-8 h-8" />}
            title="Rapidez"
            desc="Conversão em milissegundos. Baixe seu arquivo OFX pronto para o seu software de contabilidade favorito no mesmo instante."
            borderColor="border-l-secondary"
          />
          <FeatureCard 
            icon={<Cpu className="text-tertiary w-8 h-8" />}
            title="Precisão Técnica"
            desc="Algoritmos avançados de OCR e parsing para garantir que cada centavo e cada data estejam perfeitamente alinhados."
            borderColor="border-l-tertiary"
          />
        </div>
      </section>

      {/* Preview Section */}
      <section className="px-6 py-20 max-w-7xl mx-auto">
        <div className="glass-card rounded-2xl overflow-hidden shadow-2xl border border-white/5">
          <div className="bg-surface-container-high px-6 py-3 flex items-center justify-between border-b border-white/5">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-error" />
              <div className="w-3 h-3 rounded-full bg-tertiary" />
              <div className="w-3 h-3 rounded-full bg-secondary" />
            </div>
            <div className="text-xs font-bold text-on-surface-variant uppercase tracking-[0.2em]">Visualização de Conversão</div>
            <div className="w-12" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-highest/50 text-on-surface-variant text-[10px] uppercase font-black tracking-widest">
                  <th className="px-6 py-4">Data</th>
                  <th className="px-6 py-4">Descrição</th>
                  <th className="px-6 py-4 text-right">Valor (R$)</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="font-mono text-sm">
                <tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 text-on-surface-variant">12/10/2023</td>
                  <td className="px-6 py-4 text-on-surface">PAGAMENTO FORNECEDOR XYZ</td>
                  <td className="px-6 py-4 text-right text-error font-bold">- 1.250,00</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-secondary/10 text-secondary border border-secondary/20 rounded-full text-[10px] font-black uppercase">Convertido</span>
                  </td>
                </tr>
                <tr className="border-b border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-colors">
                  <td className="px-6 py-4 text-on-surface-variant">13/10/2023</td>
                  <td className="px-6 py-4 text-on-surface">RECEBIMENTO CLIENTE ABC</td>
                  <td className="px-6 py-4 text-right text-secondary font-bold">+ 4.800,00</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-secondary/10 text-secondary border border-secondary/20 rounded-full text-[10px] font-black uppercase">Convertido</span>
                  </td>
                </tr>
                <tr className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 text-on-surface-variant">15/10/2023</td>
                  <td className="px-6 py-4 text-on-surface">TARIFA BANCARIA MENSAL</td>
                  <td className="px-6 py-4 text-right text-error font-bold">- 45,00</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-secondary/10 text-secondary border border-secondary/20 rounded-full text-[10px] font-black uppercase">Convertido</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </motion.div>
  );
}

function FeatureCard({ icon, title, desc, borderColor }: { icon: React.ReactNode, title: string, desc: string, borderColor: string }) {
  return (
    <div className={`glass-card p-8 rounded-xl border-l-[4px] ${borderColor} hover:translate-y-[-4px] transition-all duration-300`}>
      <div className="mb-6">{icon}</div>
      <h4 className="text-xl font-bold text-on-surface mb-4">{title}</h4>
      <p className="text-on-surface-variant leading-relaxed opacity-80">{desc}</p>
    </div>
  );
}

function ProcessingScreen({ file, onCancel, onSuccess }: { file: File | null, onCancel: () => void, onSuccess: (blob: Blob, count: number) => void }) {
  const [internalProgress, setInternalProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;

    const uploadFile = async () => {
      const formData = new FormData();
      formData.append('file', file);

      try {
        setInternalProgress(30);
        const apiUrl = import.meta.env.DEV ? `http://${window.location.hostname}:3005/api/upload` : '/api/upload';
        const res = await fetch(apiUrl, {
          method: 'POST',
          body: formData,
        });
        
        setInternalProgress(70);

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Falha no upload do servidor');
        }

        const blob = await res.blob();
        
        // Count approximate transactions just for UI by looking at STMTTRN tags
        const text = await blob.text();
        const count = (text.match(/<STMTTRN>/g) || []).length;

        setInternalProgress(100);
        setTimeout(() => {
          onSuccess(blob, count);
        }, 500);
      } catch (err: any) {
        console.error(err);
        setErrorMsg(err.message || 'Erro de conexão.');
      }
    };

    uploadFile();
  }, [file, onSuccess, onCancel]);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      className="flex-grow flex items-center justify-center p-6 relative overflow-hidden"
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-secondary/10 blur-[120px] rounded-full pointer-events-none" />
      
      <div className="max-w-xl w-full z-10 text-center">
        <div className="bg-surface-container border border-white/5 rounded-xl p-10 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-secondary to-transparent" />
          
          <div className="flex flex-col items-center">
            <div className="mb-8 relative">
              <div className="absolute inset-0 bg-secondary blur-3xl opacity-20 animate-pulse" />
              <FileText className="w-16 h-16 text-secondary relative" />
            </div>
            
            <h1 className="text-2xl font-bold text-on-surface mb-2">Processando seu arquivo...</h1>
            <p className="text-on-surface-variant mb-10 opacity-80">Extraindo dados e formatando para OFX.</p>
            
            <div className="w-full space-y-4 mb-10">
              {errorMsg ? (
                <div className="p-4 bg-error/10 border border-error/20 rounded-lg text-error text-sm font-semibold text-center mb-4">
                  {errorMsg}
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-end px-1">
                    <span className="text-[10px] font-black text-secondary uppercase tracking-[0.2em]">Etapa 2 de 3</span>
                    <span className="text-sm font-mono text-on-surface-variant">{internalProgress}%</span>
                  </div>
                  
                  <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden border border-white/5 shadow-inner">
                    <motion.div 
                      className="h-full bg-secondary shadow-[0_0_15px_rgba(70,245,224,0.5)] relative"
                      initial={{ width: '0%' }}
                      animate={{ width: `${internalProgress}%` }}
                    >
                      <div className="absolute top-0 right-0 h-full w-8 bg-white/40 blur-md translate-x-1/2" />
                    </motion.div>
                  </div>
                  
                  <div className="flex items-center justify-center gap-2 text-on-surface-variant/60">
                    <RefreshCw className="w-3 h-3 animate-spin text-secondary" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Validando transações...</span>
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 w-full">
              <div className="bg-surface-container-low p-4 rounded-lg border border-white/5 text-left">
                <div className="text-[9px] text-on-surface-variant font-black uppercase tracking-widest mb-1 opacity-60">Arquivo Origem</div>
                <div className="text-sm text-on-surface font-medium truncate">{file?.name || 'extrato.pdf'}</div>
              </div>
              <div className="bg-surface-container-low p-4 rounded-lg border border-white/5 text-left">
                <div className="text-[9px] text-on-surface-variant font-black uppercase tracking-widest mb-1 opacity-60">Tamanho</div>
                <div className="text-sm text-on-surface font-medium">{file ? (file.size / 1024 / 1024).toFixed(2) + ' MB' : '0 MB'}</div>
              </div>
            </div>
          </div>

          <div className="mt-10 pt-8 border-t border-white/5 flex justify-center">
            <button 
              onClick={onCancel}
              className="group flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-on-surface-variant hover:text-error transition-colors"
            >
              <XCircle className="w-4 h-4" />
              Cancelar Processamento
            </button>
          </div>
        </div>
        
        <p className="mt-8 text-center text-xs font-medium text-on-surface-variant opacity-60 leading-relaxed">
          O processamento pode levar alguns segundos dependendo do número de páginas.
        </p>
      </div>
    </motion.div>
  );
}

function SuccessScreen({ ofxBlob, file, transactionCount, onReset }: { ofxBlob: Blob | null, file: File | null, transactionCount: number, onReset: () => void }) {
  const handleDownload = () => {
    if (!ofxBlob) return;
    const url = URL.createObjectURL(ofxBlob);
    const a = document.createElement('a');
    a.href = url;
    const fileName = file?.name ? file.name.replace(/\.[^/.]+$/, "") + ".ofx" : 'extrato.ofx';
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex-grow flex items-center justify-center p-6"
    >
      <div className="relative w-full max-w-2xl">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 bg-secondary/10 blur-[100px] rounded-full" />
        
        <div className="relative bg-surface-container border border-white/10 rounded-xl p-12 shadow-2xl flex flex-col items-center text-center">
          <div className="w-24 h-24 rounded-full bg-secondary-container/20 flex items-center justify-center mb-8 border border-secondary/30 relative shadow-[0_0_40px_rgba(70,245,224,0.1)]">
            <div className="absolute inset-0 bg-secondary blur-2xl opacity-10 animate-pulse" />
            <CheckCircle2 className="text-secondary w-12 h-12 relative" />
          </div>

          <h1 className="text-4xl font-black text-on-surface mb-4 leading-tight tracking-tight">
            Conversão concluída <br /> com sucesso!
          </h1>
          
          <p className="text-lg text-on-surface-variant mb-12 max-w-md">
            Seu arquivo <span className="text-secondary font-mono bg-secondary/5 px-2 py-0.5 rounded border border-secondary/20">{file?.name.replace(/\.[^/.]+$/, "") || 'extrato'}.ofx</span> está pronto.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
            <button onClick={handleDownload} className="group flex items-center justify-center gap-2 bg-primary-container text-white px-8 py-4 rounded-lg font-bold text-lg hover:brightness-110 active:scale-95 transition-all shadow-[0_0_30px_rgba(98,0,238,0.3)]">
              <Download className="w-6 h-6" />
              Baixar Arquivo .OFX
            </button>
            <button 
              onClick={onReset}
              className="flex items-center justify-center gap-2 border border-secondary/50 text-secondary px-8 py-4 rounded-lg font-bold text-lg hover:bg-secondary/10 active:scale-95 transition-all"
            >
              <RefreshCw className="w-6 h-6" />
              Converter outro arquivo
            </button>
          </div>

          <div className="mt-12 w-full pt-8 border-t border-white/5">
            <div className="grid grid-cols-2 gap-4 text-left">
              <div className="bg-surface-container-low p-5 rounded-lg border border-white/[0.02]">
                <span className="text-[10px] font-black text-outline uppercase tracking-widest block mb-1 opacity-60">Tamanho do Arquivo</span>
                <span className="font-mono text-on-surface text-lg">1.2 MB</span>
              </div>
              <div className="bg-surface-container-low p-5 rounded-lg border border-white/[0.02]">
                <span className="text-[10px] font-black text-outline uppercase tracking-widest block mb-1 opacity-60">Total de Transações</span>
                <span className="font-mono text-on-surface text-lg">{transactionCount}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-xl overflow-hidden border border-white/5 opacity-40 shadow-inner">
          <img 
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuBFFY6Mmd39149MLM1Fb-Ty4XNUknpmQfJmv_jgUhTRKsEphU3i9Sm9LTdzQ4M4IUCGK7Td5_ai7NRfPgfnX7AigG4ZbRl9JOJD76db_2jQIAtbNrx_dYVevI3Ej12cFk8mBuzMYh4Zmt-nOraRMdtuLqAbCsbhKiEAnSWUizuDVzcjtEHqu6nk25_Svxj5lkXwT0I5ln3KerrWGu20tQs3PM-mxYhneKYmZ76ZWzFzZDCnmNjk2fwYqxaGcacOkgGMSZ8IGQDdSTTK" 
            alt="Dashboard"
            className="w-full h-32 object-cover grayscale"
          />
        </div>
      </div>
    </motion.div>
  );
}

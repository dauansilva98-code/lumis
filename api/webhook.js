const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Conecta ao Supabase com as chaves que você já salvou na Vercel
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Apenas POST permitido');

    const sig = req.headers['stripe-signature'];
    let event;

    try {
        const buf = await new Promise((resolve, reject) => {
            let data = '';
            req.on('data', chunk => data += chunk);
            req.on('end', () => resolve(Buffer.from(data)));
            req.on('error', reject);
        });

        // Valida se a mensagem é realmente do Stripe
        event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        return res.status(400).send(`Erro de Assinatura: ${err.message}`);
    }

    // --- LOGICA DE ATIVAÇÃO (QUANDO O CLIENTE PAGA) ---
    if (event.type === 'checkout.session.completed' || event.type === 'invoice.paid') {
        const session = event.data.object;
        
        // Identifica o usuário pelo ID que enviamos no cadastro
        const userId = session.client_reference_id || (session.metadata && session.metadata.user_id);

        if (userId) {
            console.log(`Ativando usuário: ${userId}`);

            // ATUALIZAÇÃO NO SUPABASE: Tabela 'profiles', coluna 'subscription_status'
            await supabase
                .from('profiles') 
                .update({ 
                    subscription_status: 'active', // Muda de inactive para active
                    stripe_customer_id: session.customer,
                    stripe_subscription_id: session.subscription,
                    updated_at: new Date()
                })
                .eq('id', userId);
        }
    }

    // --- LOGICA DE BLOQUEIO (CANCELAMENTO OU FALHA) ---
    if (event.type === 'customer.subscription.deleted' || event.type === 'invoice.payment_failed') {
        const obj = event.data.object;
        const userId = (obj.metadata && obj.metadata.user_id);

        if (userId) {
            
            await supabase
                .from('profiles')
                .update({ 
                    subscription_status: 'inactive',
                    updated_at: new Date() 
                })
                .eq('id', userId);
        }
    }

    res.status(200).json({ received: true });
}
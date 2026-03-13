import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Inicializa o Stripe e o Supabase usando as chaves secretas da Vercel
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Essa configuração avisa a Vercel para não mexer no formato da mensagem do Stripe
export const config = {
    api: {
        bodyParser: false,
    },
};

// Função para ler a mensagem crua do Stripe
async function buffer(readable) {
    const chunks = [];
    for await (const chunk of readable) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Método não permitido. O Stripe só manda POST.');
    }

    const buf = await buffer(req);
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        // Valida se a mensagem veio mesmo do Stripe
        event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
    } catch (err) {
        console.error('Erro na assinatura do Stripe:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Se a assinatura for válida, vamos ver o que aconteceu
    try {
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            
            // Pega o ID do usuário que enviamos lá no cadastro.html
            const userId = session.client_reference_id; 

            if (userId) {
                // Manda o Supabase atualizar o status para ativo
                const { error } = await supabase
                    .from('profiles')
                    .update({ subscription_status: 'active' })
                    .eq('id', userId);

                if (error) {
                    console.error('Erro do Supabase:', error);
                    throw error;
                }
                
                console.log(`Sucesso! Usuário ${userId} foi ativado.`);
            } else {
                console.log('Pagamento aprovado, mas não achamos o client_reference_id.');
            }
        }

        // Responde ao Stripe que deu tudo certo
        res.status(200).json({ received: true });
    } catch (error) {
        console.error('Erro geral no Webhook:', error);
        res.status(500).json({ error: 'Erro interno' });
    }
}
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Inicializa o Stripe e o Supabase
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Avisa a Vercel para não quebrar a mensagem do Stripe
export const config = {
    api: { bodyParser: false },
};

async function buffer(readable) {
    const chunks = [];
    for await (const chunk of readable) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

// A Vercel AMA essa linha abaixo: "export default"
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Só aceita requisições POST do Stripe.');
    }

    const buf = await buffer(req);
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
    } catch (err) {
        console.error('Erro de assinatura:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const userId = session.client_reference_id; 

            if (userId) {
                const { error } = await supabase
                    .from('profiles')
                    .update({ subscription_status: 'active' })
                    .eq('id', userId);

                if (error) throw error;
                console.log(`Sucesso! Usuário ${userId} ativado.`);
            }
        }

        res.status(200).json({ received: true });
    } catch (error) {
        console.error('Erro no processamento:', error);
        res.status(500).json({ error: 'Erro interno' });
    }
}
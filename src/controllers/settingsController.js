import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function getSettings(req, res) {
  try {
    // Buscar settings, se não existir retornar vazio
    let settings = await prisma.adminSettings.findFirst()
    
    if (!settings) {
      // Se não existir, criar um registro vazio
      settings = await prisma.adminSettings.create({
        data: {
          phone: '',
          whatsappUrl: '',
          motivationalPhrase: '',
          profileImage: '',
          logo: ''
        }
      })
    }
    
    res.json(settings)
  } catch (error) {
    console.error('Erro ao buscar settings:', error)
    res.status(500).json({ error: 'Erro ao buscar configurações' })
  }
}

export async function updateSettings(req, res) {
  try {
    const { phone, whatsappUrl, motivationalPhrase, profileImage, logo } = req.body
    
    // Buscar settings existente
    let settings = await prisma.adminSettings.findFirst()
    
    if (!settings) {
      // Se não existir, criar
      settings = await prisma.adminSettings.create({
        data: {
          phone: phone || '',
          whatsappUrl: whatsappUrl || '',
          motivationalPhrase: motivationalPhrase || '',
          profileImage: profileImage || '',
          logo: logo || ''
        }
      })
    } else {
      // Se existir, atualizar
      settings = await prisma.adminSettings.update({
        where: { id: settings.id },
        data: {
          phone: phone || settings.phone,
          whatsappUrl: whatsappUrl || settings.whatsappUrl,
          motivationalPhrase: motivationalPhrase || settings.motivationalPhrase,
          profileImage: profileImage || settings.profileImage,
          logo: logo || settings.logo
        }
      })
    }
    
    res.json({ message: 'Configurações salvas com sucesso!', settings })
  } catch (error) {
    console.error('Erro ao atualizar settings:', error)
    res.status(500).json({ error: 'Erro ao salvar configurações' })
  }
}